'use client';

import { useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';
import styles from './research.module.css';

export default function Research() {
  const [prompt, setPrompt] = useState('');
  const [subtopics, setSubtopics] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decompose = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/research/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Ошибка декомпозиции');
      setSubtopics(body.subtopics ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const editSub = (i: number, value: string) =>
    setSubtopics((prev) => prev!.map((s, j) => (j === i ? value : s)));
  const removeSub = (i: number) =>
    setSubtopics((prev) => prev!.filter((_, j) => j !== i));
  const addSub = () => setSubtopics((prev) => [...(prev ?? []), '']);

  const kept = (subtopics ?? []).filter((s) => s.trim());

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

        {subtopics && (
          <section className={styles.plan}>
            <div className={styles.planHead}>
              <h2 className={styles.planTitle}>Подтемы исследования</h2>
              <span className={styles.count}>{kept.length} шт.</span>
            </div>

            <ol className={styles.list}>
              {subtopics.map((s, i) => (
                <li key={i} className={styles.item}>
                  <span className={styles.num}>{i + 1}</span>
                  <input
                    className={styles.subInput}
                    value={s}
                    onChange={(e) => editSub(i, e.target.value)}
                    placeholder="Подтема…"
                  />
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => removeSub(i)}
                    aria-label="Убрать подтему"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>

            <div className={styles.planActions}>
              <button type="button" className={styles.ghost} onClick={addSub}>
                + Добавить подтему
              </button>
              <button type="button" className={styles.primary} disabled title="Дальше — на следующем шаге">
                Далее →
              </button>
            </div>
            <p className={styles.note}>
              Дальше: сверка подтем с каталогом (что уже исследовано) и запуск. — в разработке.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
