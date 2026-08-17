'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';
import styles from './research.module.css';
import { reportToRows } from '@/lib/research/saveReport';
import type { Finding } from '@/lib/research/types';

interface Check {
  count: number;
  matches: string[];
}

export default function Research() {
  const [prompt, setPrompt] = useState('');
  const [subtopics, setSubtopics] = useState<string[] | null>(null);
  // where the subtopics come from: 'claude' (real model) or 'heuristic' (template)
  const [source, setSource] = useState<'claude' | 'heuristic' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // catalog cross-check results, by subtopic index; null = not checked yet / stale
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  // which subtopics we take into the research (by index)
  const [selected, setSelected] = useState<boolean[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  // result of running the research (Step 5)
  const [report, setReport] = useState<Finding[] | null>(null);
  // web — everything found on the web, mixed — some subtopics fell back to the catalog, mock — no key
  const [mode, setMode] = useState<string>("mock");
  // why the web engine didn't run (credits, key, limit) — shown as-is
  const [reason, setReason] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // ── saving the report to a base ──
  const [saveMode, setSaveMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState('');
  const [targetBase, setTargetBase] = useState('');
  const [customBases, setCustomBases] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ baseId: string; baseName: string; added: number; skipped: number } | null>(null);

  const totalCompanies = reportToRows(report ?? []).length;

  // ── Variant C: research on the user’s own Claude via a deeplink ──
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<{ baseId: string; baseName: string; web: string } | null>(null);
  // the result lands in the run base once Claude saves it; poll the base
  const [runRows, setRunRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [runTimedOut, setRunTimedOut] = useState(false);
  const [recheck, setRecheck] = useState(0);

  useEffect(() => {
    if (!run) return;
    let stop = false;
    const started = Date.now();
    setRunRows(null);
    setRunTimedOut(false);
    const poll = async () => {
      while (!stop) {
        try {
          const r = await fetch(`/api/records?base=${encodeURIComponent(run.baseId)}`);
          const b = await r.json();
          if (stop) return;
          if (Array.isArray(b.records) && b.records.length) { setRunRows(b.records); return; }
        } catch { /* network blip — retry */ }
        if (Date.now() - started > 5 * 60 * 1000) { if (!stop) setRunTimedOut(true); return; }
        await new Promise((res) => setTimeout(res, 4000));
      }
    };
    poll();
    return () => { stop = true; };
  }, [run, recheck]);

  const startClaude = async () => {
    if (!prompt.trim()) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Не удалось начать исследование');
      setRun({ baseId: body.baseId, baseName: body.baseName, web: body.web });
      // open the user’s OWN Claude with the ready-made prompt
      window.open(body.web, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setStarting(false);
    }
  };

  const openSave = () => {
    setNewName(prompt.trim().slice(0, 40) || 'Исследование');
    setSaved(null);
    fetch('/api/bases').then((r) => r.json()).then((b) => {
      setCustomBases((b.bases ?? []).filter((x: { builtin: boolean }) => !x.builtin).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
    }).catch(() => setCustomBases([]));
  };

  const saveToBase = async () => {
    const target = saveMode === 'new'
      ? { mode: 'new' as const, name: newName.trim() }
      : { mode: 'existing' as const, baseId: targetBase };
    if (saveMode === 'new' ? !newName.trim() : !targetBase) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/research/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, target }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Ошибка сохранения');
      setSaved(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

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
      setSource(body.source === 'claude' ? 'claude' : 'heuristic');
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
      // Hint: uncheck "already exists" (don't duplicate), keep "new".
      const suggested = (subtopics ?? []).map(
        (s, i) => s.trim() !== '' && (results[i]?.count ?? 0) === 0,
      );
      // ...but if the catalog already knows everything, auto-unchecking would zero out the
      // selection and "Next →" would stay permanently disabled with no explanation.
      // In that case we leave everything checked — the human decides, not a dead end.
      const anyNew = suggested.some(Boolean);
      setSelected(anyNew ? suggested : (subtopics ?? []).map((s) => s.trim() !== ''));
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
      setMode(body.mode ?? "mock");
      setReason(body.reason ?? null);
      if ((body.report ?? []).length) openSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRunning(false);
    }
  };

  // any edit to the list makes the previous cross-check stale
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
            onClick={startClaude}
            disabled={starting || !prompt.trim()}
            title="Откроется твой Claude с готовым запросом; он исследует и сохранит результат в базу"
          >
            {starting ? 'Открываю Claude…' : '🔎 Исследовать в моём Claude'}
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={decompose}
            disabled={loading || !prompt.trim()}
            title="Разложить запрос на подтемы прямо на сайте (без Claude)"
          >
            {loading ? 'Раскладываю…' : 'Разложить на подтемы'}
          </button>
          {error && <span className={styles.error}>{error}</span>}
        </div>

        {run && (
          <section className={styles.claudeRun}>
            {runRows ? (
              /* the result arrived in the base — show it right here */
              <>
                <div className={styles.claudeRunTitle}>✅ Готово — найдено {runRows.length}</div>
                <ul className={styles.runResults}>
                  {runRows.slice(0, 40).map((r, i) => (
                    <li key={i} className={styles.runResult}>
                      <span className={styles.runName}>{String(r.name ?? r['название'] ?? '—')}</span>
                      {r.what || r['что_делает'] ? <span className={styles.runWhat}>{String(r.what ?? r['что_делает'])}</span> : null}
                      {r.url ? <a className={styles.runUrl} href={String(r.url)} target="_blank" rel="noreferrer">↗</a> : null}
                    </li>
                  ))}
                </ul>
                <div className={styles.claudeRunActions}>
                  <Link className={styles.primary} href={`/?base=${encodeURIComponent(run.baseId)}`}>Открыть базу «{run.baseName}» →</Link>
                </div>
              </>
            ) : runTimedOut ? (
              /* nothing arrived within 5 minutes */
              <>
                <div className={styles.claudeRunTitle}>Пока пусто</div>
                <p className={styles.claudeHint}>
                  Проверь, что в Claude ты нажал <b>Enter</b> и что коннектор AI-Researcher подключён
                  (Настройки → Коннекторы). Как Claude сохранит результат — нажми «Проверить снова».
                </p>
                <div className={styles.claudeRunActions}>
                  <button type="button" className={styles.primary} onClick={() => setRecheck((n) => n + 1)}>Проверить снова</button>
                  <a className={styles.ghost} href={run.web} target="_blank" rel="noreferrer">Открыть Claude ещё раз</a>
                  <Link className={styles.ghost} href={`/?base=${encodeURIComponent(run.baseId)}`}>Открыть базу на сайте →</Link>
                </div>
              </>
            ) : (
              /* waiting for Claude to write the result */
              <>
                <div className={styles.claudeRunTitle}>⏳ Жду результат от Claude…</div>
                <ol className={styles.claudeSteps}>
                  <li>В открывшейся вкладке Claude нажми <b>Enter</b> — запрос уже подставлен.</li>
                  <li>Claude исследует и сохранит результат в базу <b>«{run.baseName}»</b> через коннектор AI-Researcher.</li>
                  <li>Результат появится здесь автоматически (обычно 1–3 минуты).</li>
                </ol>
                <div className={styles.claudeRunActions}>
                  <a className={styles.primary} href={run.web} target="_blank" rel="noreferrer">Открыть Claude ещё раз</a>
                  <Link className={styles.ghost} href={`/?base=${encodeURIComponent(run.baseId)}`}>Открыть базу на сайте →</Link>
                </div>
                <p className={styles.claudeHint}>Нужен подключённый коннектор AI-Researcher в твоём Claude. Исследование идёт на твоей подписке.</p>
              </>
            )}
          </section>
        )}

        {subtopics && !confirmed && (
          <section className={styles.plan}>
            <div className={styles.planHead}>
              <h2 className={styles.planTitle}>
                Подтемы исследования
                {source && (
                  <span
                    className={`${styles.srcTag} ${source === 'claude' ? styles.srcClaude : styles.srcHeur}`}
                    title={source === 'claude' ? 'Разложено моделью Claude' : 'Шаблонная разбивка (Claude не подключён)'}
                  >
                    {source === 'claude' ? '✨ Claude' : 'шаблон'}
                  </span>
                )}
              </h2>
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
            {mode !== 'web' && (
              <p className={styles.mockBanner}>
                {reason
                  ? `⚠️ ${reason} Отчёт собран из каталога.`
                  : mode === 'mixed'
                    ? '⚙️ Часть подтем не удалось прогнать по вебу — они собраны из каталога.'
                    : '⚙️ Демо-режим: отчёт собран из каталога. Живой веб-поиск включается ключом OPENROUTER_API_KEY.'}
              </p>
            )}

            <div className={styles.reportList}>
              {report.map((f, i) => (
                <article key={i} className={styles.finding}>
                  <h3 className={styles.findingTitle}>
                    {f.subtopic}
                    <span className={f.source === 'web' ? styles.srcWeb : styles.srcCat}>
                      {f.source === 'web' ? '🌐 веб' : '📁 каталог'}
                    </span>
                  </h3>
                  <p className={styles.findingSummary}>{f.summary}</p>
                  <ul className={styles.findingList}>
                    {f.findings.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                  {f.relevant.length > 0 && (
                    <div className={styles.relevantRow}>
                      {f.relevant.map((c) =>
                        c.id.startsWith('web:') ? (
                          // the company isn't in the catalog yet — link to its site
                          <a
                            key={c.id}
                            href={c.url ?? '#'}
                            target="_blank"
                            rel="noreferrer"
                            className={`${styles.relevantChip} ${styles.chipNew}`}
                            title={c.vertical ?? undefined}
                          >
                            {c.name}
                            <span className={styles.chipMeta}>новое</span>
                          </a>
                        ) : (
                          <Link key={c.id} href={`/product/${c.id}`} className={styles.relevantChip}>
                            {c.name}
                            {c.vertical ? <span className={styles.chipMeta}>{c.vertical}</span> : null}
                          </Link>
                        ),
                      )}
                    </div>
                  )}
                  {f.sources.length > 0 && f.source === 'web' && (
                    <div className={styles.sourceList}>
                      <span className={styles.sourceLabel}>Источники:</span>
                      {f.sources.slice(0, 5).map((s, j) => (
                        <a key={j} href={s.url} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                          {new URL(s.url).hostname.replace(/^www\./, '')}
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>

            {totalCompanies > 0 && !saved && (
              <div className={styles.saveBox}>
                <div className={styles.saveTitle}>Сохранить найденные компании в базу ({totalCompanies})</div>
                <label className={styles.saveRow}>
                  <input type="radio" checked={saveMode === 'new'} onChange={() => setSaveMode('new')} />
                  Новая база:
                  <input className={styles.saveInput} value={newName} onChange={(e) => setNewName(e.target.value)}
                    disabled={saveMode !== 'new'} placeholder="Название базы" />
                </label>
                <label className={styles.saveRow}>
                  <input type="radio" checked={saveMode === 'existing'} onChange={() => setSaveMode('existing')} />
                  В существующую:
                  <select className={styles.saveInput} value={targetBase} onChange={(e) => setTargetBase(e.target.value)}
                    disabled={saveMode !== 'existing'}>
                    <option value="">— выбрать —</option>
                    {customBases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <button type="button" className={styles.primary} onClick={saveToBase}
                  disabled={saving || (saveMode === 'new' ? !newName.trim() : !targetBase)}>
                  {saving ? 'Сохраняю…' : 'Сохранить в базу'}
                </button>
              </div>
            )}
            {saved && (
              <p className={styles.savedLine}>
                ✅ Сохранено {saved.added} в «{saved.baseName}»{saved.skipped ? ` (пропущено дублей: ${saved.skipped})` : ''}.{' '}
                <Link href={`/?base=${encodeURIComponent(saved.baseId)}`} className={styles.savedLink}>Открыть базу →</Link>
              </p>
            )}

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
