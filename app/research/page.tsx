'use client';

import { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';
import { IconSearch, IconCheck, IconFlask, IconTrash } from '../icons';
import { apiJson, apiSend } from '@/lib/api';
import { useToast, useConfirm } from '../ui';
import styles from './research.module.css';

interface RunInfo {
  id: string;
  name: string;
  createdAt: string | null;
  rows: number;
}

// the run in flight survives a reload — it used to live only in React state,
// so closing the tab orphaned the base with no way back to it
const ACTIVE_RUN_KEY = 'ais.research.run';

export default function Research() {
  const toast = useToast();
  const confirm = useConfirm();
  const [prompt, setPrompt] = useState('');

  // ── Variant C: research on the user's own Claude via a deeplink ──
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<{ baseId: string; baseName: string; web: string } | null>(null);
  // Your past runs, so an abandoned one is findable and removable instead of
  // sitting in the tree forever
  const [runs, setRuns] = useState<RunInfo[] | null>(null);
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
          const b = await apiJson<{ records?: Array<Record<string, unknown>> }>(`/api/records?base=${encodeURIComponent(run.baseId)}`);
          if (stop) return;
          if (Array.isArray(b.records) && b.records.length) { setRunRows(b.records); return; }
        } catch { /* poll error — swallow and retry, a toast here would spam */ }
        if (Date.now() - started > 5 * 60 * 1000) { if (!stop) setRunTimedOut(true); return; }
        await new Promise((res) => setTimeout(res, 4000));
      }
    };
    poll();
    return () => { stop = true; };
  }, [run, recheck]);

  const loadRuns = useCallback(() => {
    apiJson<{ runs?: RunInfo[] }>('/api/research/runs')
      .then((b) => setRuns(b.runs ?? []))
      .catch(() => setRuns([]));
  }, []);

  // restore the run we were waiting on, and list past ones
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_RUN_KEY);
      if (saved) setRun(JSON.parse(saved));
    } catch { /* corrupted entry — just start clean */ }
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    try {
      if (run) localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(run));
      else localStorage.removeItem(ACTIVE_RUN_KEY);
    } catch { /* private mode — the run just won't survive a reload */ }
  }, [run]);

  const dropRun = async (r: RunInfo) => {
    const ok = await confirm({
      title: `Удалить «${r.name}»?`,
      message: r.rows
        ? `В запуске ${r.rows} строк. База уедет в корзину — вернуть можно оттуда.`
        : 'Запуск пустой. База уедет в корзину — вернуть можно оттуда.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiSend('/api/bases', 'DELETE', { id: r.id });
      if (run?.baseId === r.id) setRun(null);
      loadRuns();
      toast('Запуск удалён');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось удалить запуск');
    }
  };

  const tidy = async () => {
    try {
      const { moved } = await apiSend<{ moved: number }>('/api/research/runs', 'POST', {});
      loadRuns();
      toast(moved ? `Прибрано: ${moved}` : 'Всё уже на месте');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось прибрать');
    }
  };

  const startClaude = async () => {
    if (!prompt.trim()) return;
    setStarting(true);
    try {
      const body = await apiSend<{ baseId: string; baseName: string; web: string }>('/api/research/start', 'POST', { prompt });
      setRun({ baseId: body.baseId, baseName: body.baseName, web: body.web });
      loadRuns();
      // open the user's OWN Claude with the ready-made prompt
      window.open(body.web, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось начать исследование');
    } finally {
      setStarting(false);
    }
  };

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
          Опиши, что нужно исследовать. Откроется твой Claude с готовым запросом — он
          соберёт данные и сохранит их в базу, а результат появится здесь.
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
            {starting ? 'Открываю Claude…' : <><IconSearch size={15} /> Исследовать в моём Claude</>}
          </button>
        </div>

        {run && (
          <section className={styles.claudeRun}>
            {runRows ? (
              /* the result arrived in the base — show it right here */
              <>
                <div className={styles.claudeRunTitle}><IconCheck size={16} /> Готово — найдено {runRows.length}</div>
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
                  Проверь, что в Claude ты нажал <b>Enter</b> и что коннектор AiS подключён.
                  Как Claude сохранит результат — нажми «Проверить снова».
                </p>
                <div className={styles.claudeRunActions}>
                  <button type="button" className={styles.primary} onClick={() => setRecheck((n) => n + 1)}>Проверить снова</button>
                  <Link className={styles.ghost} href="/connect">Как подключить коннектор →</Link>
                  <a className={styles.ghost} href={run.web} target="_blank" rel="noreferrer">Открыть Claude ещё раз</a>
                  <Link className={styles.ghost} href={`/?base=${encodeURIComponent(run.baseId)}`}>Открыть базу на сайте →</Link>
                </div>
              </>
            ) : (
              /* waiting for Claude to write the result */
              <>
                <div className={styles.claudeRunTitle}><IconFlask size={16} /> Жду результат от Claude…</div>
                <ol className={styles.claudeSteps}>
                  <li>В открывшейся вкладке Claude нажми <b>Enter</b> — запрос уже подставлен.</li>
                  <li>Claude исследует и сохранит результат в базу <b>«{run.baseName}»</b> через коннектор AiS.</li>
                  <li>Результат появится здесь автоматически (обычно 1–3 минуты).</li>
                </ol>
                <div className={styles.claudeRunActions}>
                  <a className={styles.primary} href={run.web} target="_blank" rel="noreferrer">Открыть Claude ещё раз</a>
                  <Link className={styles.ghost} href={`/?base=${encodeURIComponent(run.baseId)}`}>Открыть базу на сайте →</Link>
                </div>
                <p className={styles.claudeHint}>
                  Нужен подключённый коннектор AiS в твоём Claude — <Link href="/connect">как подключить</Link>.
                  Исследование идёт на твоей подписке.
                </p>
              </>
            )}
          </section>
        )}

        {runs && runs.length > 0 && (
          <section className={styles.runsBlock}>
            <div className={styles.runsHead}>
              <h2>Твои запуски</h2>
              {runs.some((r) => !r.rows) && (
                <span className={styles.runsHint}>пустые можно удалить — это брошенные</span>
              )}
              <button type="button" className={styles.tidy} onClick={tidy} title="Сложить старые запуски в папку «Исследования»">
                Прибрать
              </button>
            </div>
            <ul className={styles.runsList}>
              {runs.map((r) => (
                <li key={r.id} className={styles.runsItem}>
                  <Link className={styles.runsName} href={`/?base=${encodeURIComponent(r.id)}`}>{r.name}</Link>
                  <span className={r.rows ? styles.runsRows : styles.runsEmpty}>
                    {r.rows ? `${r.rows} строк` : 'пусто'}
                  </span>
                  <button type="button" className={styles.runsDrop} onClick={() => dropRun(r)} title="Удалить запуск в корзину">
                    <IconTrash size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
