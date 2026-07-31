'use client';

import { useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';
import styles from './research.module.css';

interface Check {
  count: number;
  matches: string[];
}

interface RelevantCompany {
  id: string;
  name: string;
  verdict: string | null;
  vertical: string | null;
  url: string | null;
}

interface Finding {
  subtopic: string;
  summary: string;
  findings: string[];
  relevant: RelevantCompany[];
  sources: Array<{ title: string; url: string }>;
  source: 'mock';
}

export default function Research() {
  const [prompt, setPrompt] = useState('');
  const [subtopics, setSubtopics] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // результаты сверки с каталогом, по индексу подтемы; null = ещё не сверяли / устарело
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  // какие подтемы берём в исследование (по индексу)
  const [selected, setSelected] = useState<boolean[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  // результат запуска исследования (Шаг 5)
  const [report, setReport] = useState<Finding[] | null>(null);
  const [running, setRunning] = useState(false);

  const decompose = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setChecks(null);
    try {
      const res = await fetch('/api/research/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Ошибка декомпозиции');
      const subs: string[] = body.subtopics ?? [];
      setSubtopics(subs);
      setSelected(subs.map(() => true));
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const check = async () => {
    if (!subtopics) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/research/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtopics }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Ошибка сверки');
      const results: Check[] = body.results ?? [];
      setChecks(results);
      // подсказка: «уже есть» снимаем (не дублируем), «новое» оставляем
      setSelected((subtopics ?? []).map((s, i) => s.trim() !== '' && (results[i]?.count ?? 0) === 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setChecking(false);
    }
  };

  const runResearch = async () => {
    const subs = (subtopics ?? []).filter((s, i) => s.trim() && selected[i]);
    if (!subs.length) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/research/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtopics: subs }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Ошибка запуска');
      setReport(body.report ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRunning(false);
    }
  };

  // любая правка списка делает прошлую сверку неактуальной
  const editSub = (i: number, value: string) => {
    setSubtopics((prev) => prev!.map((s, j) => (j === i ? value : s)));
    setChecks(null);
  };
  const removeSub = (i: number) => {
    setSubtopics((prev) => prev!.filter((_, j) => j !== i));
    setSelected((prev) => prev.filter((_, j) => j !== i));
    setChecks(null);
  };
  const addSub = () => {
    setSubtopics((prev) => [...(prev ?? []), '']);
    setSelected((prev) => [...prev, true]);
    setChecks(null);
  };
  const toggleSel = (i: number) =>
    setSelected((prev) => prev.map((v, j) => (j === i ? !v : v)));

  const kept = (subtopics ?? []).filter((s) => s.trim());
  const toResearch = (subtopics ?? []).filter((s, i) => s.trim() && selected[i]);
  const toSkip = (subtopics ?? []).filter((s, i) => s.trim() && !selected[i]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          <span aria-hidden="true">←</span> К каталогу
        </Link>
        <div className={styles.headerActions}>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <h1 className={styles.title}>Новое исследование</h1>
        <p className={styles.lead}>
          Опиши, что нужно исследовать. Система разложит запрос на подтемы — их можно
          править, прежде чем запускать.
        </p>

        <textarea
          className={styles.prompt}
          placeholder="Напр.: лучшие практики использования AI-агентов в продажах…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={decompose}
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Раскладываю…' : 'Разложить на подтемы'}
          </button>
          {error && <span className={styles.error}>{error}</span>}
        </div>

        {subtopics && !confirmed && (
          <section className={styles.plan}>
            <div className={styles.planHead}>
              <h2 className={styles.planTitle}>Подтемы исследования</h2>
              <span className={styles.count}>{kept.length} шт. · выбрано {toResearch.length}</span>
            </div>

            <ol className={styles.list}>
              {subtopics.map((s, i) => {
                const c = checks?.[i];
                return (
                  <li key={i} className={styles.item}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={selected[i] ?? false}
                      onChange={() => toggleSel(i)}
                      aria-label="Взять в исследование"
                    />
                    <span className={styles.num}>{i + 1}</span>
                    <input
                      className={styles.subInput}
                      value={s}
                      onChange={(e) => editSub(i, e.target.value)}
                      placeholder="Подтема…"
                    />
                    {c && (
                      c.count > 0 ? (
                        <span
                          className={`${styles.tag} ${styles.tagKnown}`}
                          title={c.matches.length ? `Похоже: ${c.matches.join(', ')}` : undefined}
                        >
                          ✅ уже есть ({c.count})
                        </span>
                      ) : (
                        <span className={`${styles.tag} ${styles.tagNew}`}>🆕 новое</span>
                      )
                    )}
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => removeSub(i)}
                      aria-label="Убрать подтему"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className={styles.planActions}>
              <button type="button" className={styles.ghost} onClick={addSub}>
                + Добавить подтему
              </button>
              <div className={styles.planRight}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={check}
                  disabled={checking || kept.length === 0}
                >
                  {checking ? 'Сверяю…' : 'Сверить с каталогом'}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setConfirmed(true)}
                  disabled={toResearch.length === 0}
                >
                  Далее →
                </button>
              </div>
            </div>
            <p className={styles.note}>
              «Сверить с каталогом» помечает подтемы, по которым уже есть данные (✅), и новые (🆕).
              Сними галочку с тех, что исследовать не нужно.
            </p>
          </section>
        )}

        {subtopics && confirmed && !report && (
          <section className={styles.plan}>
            <div className={styles.planHead}>
              <h2 className={styles.planTitle}>Готово к запуску</h2>
              <span className={styles.count}>{toResearch.length} к исследованию</span>
            </div>

            <div className={styles.summaryGroup}>
              <div className={styles.summaryLabel}>🔬 Будем исследовать ({toResearch.length})</div>
              <ul className={styles.summaryList}>
                {toResearch.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            {toSkip.length > 0 && (
              <div className={styles.summaryGroup}>
                <div className={styles.summaryLabel}>⏭ Пропускаем — уже есть ({toSkip.length})</div>
                <ul className={`${styles.summaryList} ${styles.summarySkip}`}>
                  {toSkip.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.planActions}>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setConfirmed(false)}
                disabled={running}
              >
                ← Изменить
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={runResearch}
                disabled={running || toResearch.length === 0}
              >
                {running ? 'Исследую…' : 'Запустить исследование'}
              </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </section>
        )}

        {report && (
          <section className={styles.plan}>
            <div className={styles.planHead}>
              <h2 className={styles.planTitle}>Результаты исследования</h2>
              <span className={styles.count}>{report.length} подтем</span>
            </div>
            <p className={styles.mockBanner}>
              ⚙️ Демо-режим: отчёт собран из каталога (412 компаний). Реальный веб-поиск
              и синтез Claude подключаются в эту же структуру.
            </p>

            <div className={styles.reportList}>
              {report.map((f, i) => (
                <article key={i} className={styles.finding}>
                  <h3 className={styles.findingTitle}>{f.subtopic}</h3>
                  <p className={styles.findingSummary}>{f.summary}</p>
                  <ul className={styles.findingList}>
                    {f.findings.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                  {f.relevant.length > 0 && (
                    <div className={styles.relevantRow}>
                      {f.relevant.map((c) => (
                        <Link key={c.id} href={`/product/${c.id}`} className={styles.relevantChip}>
                          {c.name}
                          {c.vertical ? <span className={styles.chipMeta}>{c.vertical}</span> : null}
                        </Link>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className={styles.planActions}>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  setReport(null);
                  setConfirmed(false);
                }}
              >
                ← Новое исследование
              </button>
              <Link href="/" className={styles.primary}>
                К каталогу →
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
