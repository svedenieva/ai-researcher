'use client';

import { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';
import { IconSearch, IconCheck, IconFlask, IconTrash } from '../icons';
import { ApiError, apiJson, apiSend } from '@/lib/api';
import { extractRow, scoreRows } from '@/lib/research/eval';
import { useToast, useConfirm } from '../ui';
import { useLang } from '../lang-provider';
import type { Lang } from '@/lib/i18n';
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

// The seeded columns every run base starts with; everything ELSE is an aspect
// Claude chose for THIS question, so its fill rate is "how covered is that
// aspect" — an empty aspect column is a gap the answer left open.
const SEED_KEYS = new Set([
  'название', 'назва', 'name', 'title',
  'цитата', 'quote',
  'источники', 'источник', 'sources', 'source', 'url', 'ссылка', 'посилання',
]);

function aspectCoverage(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ key: string; label: string }>,
): Array<{ key: string; label: string; filled: number; total: number; covered: boolean }> {
  const total = rows.length;
  return columns
    .filter((c) => !c.key.startsWith('__') && !SEED_KEYS.has(c.key.toLowerCase()))
    .map((c) => {
      const filled = rows.filter((r) => {
        const v = r[c.key];
        return v !== null && v !== undefined && String(v).trim() !== '';
      }).length;
      return { key: c.key, label: c.label || c.key, filled, total, covered: filled > 0 };
    });
}

// Co-located UI strings for this page. Ukrainian is the source wording; ru/en
// are translated. Only UI text lives here — never data field keys or values.
const S: Record<Lang, {
  runNotFound: string;
  deleteTitle: (n: string) => string;
  deleteMsgRows: (n: number) => string;
  deleteMsgEmpty: string;
  deleteConfirm: string;
  runDeleted: string;
  runDeleteFailed: string;
  tidied: (n: number) => string;
  tidyNothing: string;
  tidyFailed: string;
  promptCopied: string;
  copyFailed: string;
  serverDone: (n: number) => string;
  serverStartFailed: string;
  startFailed: string;
  backToCatalog: string;
  pageTitle: string;
  lead: string;
  promptPlaceholder: string;
  startClaudeTitle: string;
  opening: string;
  researchInMyClaude: string;
  startServerTitle: string;
  researchOnServer: string;
  doneFound: (n: number) => string;
  qLinksTitle: string;
  qLinks: string;
  qQuotesTitle: string;
  qQuotes: string;
  qDuplicatesTitle: string;
  qDuplicates: string;
  qEmptyTitle: string;
  qEmpty: string;
  aspects: string;
  aspectsNotCovered: (n: number) => string;
  aspectsAllCovered: string;
  aspectFillTitle: (f: number, t: number) => string;
  openBase: (n: string) => string;
  stillEmpty: string;
  connectorCause: string;
  connectorNote1: string;
  connectorNote2: string;
  connectorNote3: string;
  connectAis: string;
  recheckBtn: string;
  openClaudeAgain: string;
  copyPromptBtn: string;
  openBaseOnSite: string;
  pressEnterHint1: string;
  pressEnterHint2: string;
  waitingResult: string;
  step1a: string;
  step1b: string;
  step2a: string;
  step2b: string;
  step3: string;
  subHint1: string;
  linkHowConnect: string;
  subHint2: string;
  yourRuns: string;
  emptyCanDelete: string;
  tidyTitle: string;
  tidyBtn: string;
  runsRows: (n: number) => string;
  runsEmpty: string;
  deleteRunTitle: string;
}> = {
  uk: {
    runNotFound: 'Базу запуску не знайдено — можливо, її видалили',
    deleteTitle: (n) => `Видалити «${n}»?`,
    deleteMsgRows: (n) => `У запуску ${n} рядків. База поїде в кошик — повернути можна звідти.`,
    deleteMsgEmpty: 'Запуск порожній. База поїде в кошик — повернути можна звідти.',
    deleteConfirm: 'Видалити',
    runDeleted: 'Запуск видалено',
    runDeleteFailed: 'Не вдалося видалити запуск',
    tidied: (n) => `Прибрано: ${n}`,
    tidyNothing: 'Усе вже на місці',
    tidyFailed: 'Не вдалося прибрати',
    promptCopied: 'Запит скопійовано — встав його у свій Claude',
    copyFailed: 'Не вдалося скопіювати',
    serverDone: (n) => `Готово на сервері — додано рядків: ${n}`,
    serverStartFailed: 'Не вдалося запустити на сервері',
    startFailed: 'Не вдалося почати дослідження',
    backToCatalog: 'До каталогу',
    pageTitle: 'Нове дослідження',
    lead: 'Опиши, що потрібно дослідити. Відкриється твій Claude з готовим запитом — він збере дані та збереже їх у базу, а результат з’явиться тут.',
    promptPlaceholder: 'Напр.: найкращі практики використання AI-агентів у продажах…',
    startClaudeTitle: 'Відкриється твій Claude з готовим запитом; він дослідить і збереже результат у базу',
    opening: 'Відкриваю Claude…',
    researchInMyClaude: 'Дослідити в моєму Claude',
    startServerTitle: 'Провести дослідження на сервері (на нашому ключі), без відкриття твого Claude',
    researchOnServer: 'Дослідити на сервері',
    doneFound: (n) => `Готово — знайдено ${n}`,
    qLinksTitle: 'Частка рядків із посиланням на джерело',
    qLinks: 'посилання',
    qQuotesTitle: 'Частка рядків із дослівною цитатою',
    qQuotes: 'цитати',
    qDuplicatesTitle: 'Рядки з однаковою назвою',
    qDuplicates: 'дублі',
    qEmptyTitle: 'Порожні рядки — без назви, цитати й посилання',
    qEmpty: 'порожні',
    aspects: 'Аспекти',
    aspectsNotCovered: (n) => ` · не розкрито: ${n}`,
    aspectsAllCovered: ' · усі розкриті',
    aspectFillTitle: (f, t) => `${f} з ${t} рядків заповнено`,
    openBase: (n) => `Відкрити базу «${n}» →`,
    stillEmpty: 'Поки порожньо',
    connectorCause: 'Найчастіша причина',
    connectorNote1: ' — у твоєму Claude не підключено конектор ',
    connectorNote2: '. Без нього Claude не має інструмента ',
    connectorNote3: ' і не може записати результат сюди — тому тут порожньо. Швидка перевірка: спитай у того ж Claude «які інструменти AiS тобі доступні?». Якщо порожньо — підключи конектор і повтори.',
    connectAis: 'Підключити конектор AiS →',
    recheckBtn: 'Перевірити знову',
    openClaudeAgain: 'Відкрити Claude ще раз',
    copyPromptBtn: 'Скопіювати запит',
    openBaseOnSite: 'Відкрити базу на сайті →',
    pressEnterHint1: 'Також переконайся, що у вкладці Claude ти натиснув ',
    pressEnterHint2: '. Коли результат збережеться — натисни «Перевірити знову».',
    waitingResult: 'Чекаю результат від Claude…',
    step1a: 'У відкритій вкладці Claude натисни ',
    step1b: ' — запит уже підставлено.',
    step2a: 'Claude дослідить і збереже результат у базу ',
    step2b: ' через конектор AiS.',
    step3: 'Результат з’явиться тут автоматично (зазвичай 1–3 хвилини).',
    subHint1: 'Потрібен підключений конектор AiS у твоєму Claude — ',
    linkHowConnect: 'як підключити',
    subHint2: '. Дослідження йде на твоїй підписці.',
    yourRuns: 'Твої запуски',
    emptyCanDelete: 'порожні можна видалити — це покинуті',
    tidyTitle: 'Скласти старі запуски в папку «Дослідження»',
    tidyBtn: 'Прибрати',
    runsRows: (n) => `${n} рядків`,
    runsEmpty: 'порожньо',
    deleteRunTitle: 'Видалити запуск у кошик',
  },
  ru: {
    runNotFound: 'База запуска не найдена — возможно, её удалили',
    deleteTitle: (n) => `Удалить «${n}»?`,
    deleteMsgRows: (n) => `В запуске ${n} строк. База отправится в корзину — вернуть можно оттуда.`,
    deleteMsgEmpty: 'Запуск пустой. База отправится в корзину — вернуть можно оттуда.',
    deleteConfirm: 'Удалить',
    runDeleted: 'Запуск удалён',
    runDeleteFailed: 'Не удалось удалить запуск',
    tidied: (n) => `Убрано: ${n}`,
    tidyNothing: 'Всё уже на месте',
    tidyFailed: 'Не удалось убрать',
    promptCopied: 'Запрос скопирован — вставь его в свой Claude',
    copyFailed: 'Не удалось скопировать',
    serverDone: (n) => `Готово на сервере — добавлено строк: ${n}`,
    serverStartFailed: 'Не удалось запустить на сервере',
    startFailed: 'Не удалось начать исследование',
    backToCatalog: 'В каталог',
    pageTitle: 'Новое исследование',
    lead: 'Опиши, что нужно исследовать. Откроется твой Claude с готовым запросом — он соберёт данные и сохранит их в базу, а результат появится здесь.',
    promptPlaceholder: 'Напр.: лучшие практики использования AI-агентов в продажах…',
    startClaudeTitle: 'Откроется твой Claude с готовым запросом; он исследует и сохранит результат в базу',
    opening: 'Открываю Claude…',
    researchInMyClaude: 'Исследовать в моём Claude',
    startServerTitle: 'Провести исследование на сервере (на нашем ключе), без открытия твоего Claude',
    researchOnServer: 'Исследовать на сервере',
    doneFound: (n) => `Готово — найдено ${n}`,
    qLinksTitle: 'Доля строк со ссылкой на источник',
    qLinks: 'ссылки',
    qQuotesTitle: 'Доля строк с дословной цитатой',
    qQuotes: 'цитаты',
    qDuplicatesTitle: 'Строки с одинаковым названием',
    qDuplicates: 'дубли',
    qEmptyTitle: 'Пустые строки — без названия, цитаты и ссылки',
    qEmpty: 'пустые',
    aspects: 'Аспекты',
    aspectsNotCovered: (n) => ` · не раскрыто: ${n}`,
    aspectsAllCovered: ' · все раскрыты',
    aspectFillTitle: (f, t) => `${f} из ${t} строк заполнено`,
    openBase: (n) => `Открыть базу «${n}» →`,
    stillEmpty: 'Пока пусто',
    connectorCause: 'Самая частая причина',
    connectorNote1: ' — в твоём Claude не подключён коннектор ',
    connectorNote2: '. Без него у Claude нет инструмента ',
    connectorNote3: ' и он не может записать результат сюда — поэтому здесь пусто. Быстрая проверка: спроси у того же Claude «какие инструменты AiS тебе доступны?». Если пусто — подключи коннектор и повтори.',
    connectAis: 'Подключить коннектор AiS →',
    recheckBtn: 'Проверить снова',
    openClaudeAgain: 'Открыть Claude ещё раз',
    copyPromptBtn: 'Скопировать запрос',
    openBaseOnSite: 'Открыть базу на сайте →',
    pressEnterHint1: 'Также убедись, что во вкладке Claude ты нажал ',
    pressEnterHint2: '. Когда результат сохранится — нажми «Проверить снова».',
    waitingResult: 'Жду результат от Claude…',
    step1a: 'В открытой вкладке Claude нажми ',
    step1b: ' — запрос уже подставлен.',
    step2a: 'Claude исследует и сохранит результат в базу ',
    step2b: ' через коннектор AiS.',
    step3: 'Результат появится здесь автоматически (обычно 1–3 минуты).',
    subHint1: 'Нужен подключённый коннектор AiS в твоём Claude — ',
    linkHowConnect: 'как подключить',
    subHint2: '. Исследование идёт на твоей подписке.',
    yourRuns: 'Твои запуски',
    emptyCanDelete: 'пустые можно удалить — это брошенные',
    tidyTitle: 'Сложить старые запуски в папку «Исследования»',
    tidyBtn: 'Убрать',
    runsRows: (n) => `${n} строк`,
    runsEmpty: 'пусто',
    deleteRunTitle: 'Удалить запуск в корзину',
  },
  en: {
    runNotFound: 'Run base not found — it may have been deleted',
    deleteTitle: (n) => `Delete “${n}”?`,
    deleteMsgRows: (n) => `The run has ${n} rows. The base goes to the bin — you can restore it from there.`,
    deleteMsgEmpty: 'The run is empty. The base goes to the bin — you can restore it from there.',
    deleteConfirm: 'Delete',
    runDeleted: 'Run deleted',
    runDeleteFailed: 'Could not delete the run',
    tidied: (n) => `Tidied: ${n}`,
    tidyNothing: 'Everything is already in place',
    tidyFailed: 'Could not tidy up',
    promptCopied: 'Prompt copied — paste it into your Claude',
    copyFailed: 'Could not copy',
    serverDone: (n) => `Done on the server — rows added: ${n}`,
    serverStartFailed: 'Could not start on the server',
    startFailed: 'Could not start the research',
    backToCatalog: 'To catalog',
    pageTitle: 'New research',
    lead: 'Describe what you need to research. Your Claude will open with a ready-made prompt — it will gather the data and save it to a base, and the result will appear here.',
    promptPlaceholder: 'E.g.: best practices for using AI agents in sales…',
    startClaudeTitle: 'Your Claude will open with a ready-made prompt; it will research and save the result to a base',
    opening: 'Opening Claude…',
    researchInMyClaude: 'Research in my Claude',
    startServerTitle: 'Run the research on the server (on our key), without opening your Claude',
    researchOnServer: 'Research on the server',
    doneFound: (n) => `Done — found ${n}`,
    qLinksTitle: 'Share of rows with a link to the source',
    qLinks: 'links',
    qQuotesTitle: 'Share of rows with a verbatim quote',
    qQuotes: 'quotes',
    qDuplicatesTitle: 'Rows with the same name',
    qDuplicates: 'duplicates',
    qEmptyTitle: 'Empty rows — no name, quote or link',
    qEmpty: 'empty',
    aspects: 'Aspects',
    aspectsNotCovered: (n) => ` · not covered: ${n}`,
    aspectsAllCovered: ' · all covered',
    aspectFillTitle: (f, t) => `${f} of ${t} rows filled`,
    openBase: (n) => `Open base “${n}” →`,
    stillEmpty: 'Still empty',
    connectorCause: 'The most common cause',
    connectorNote1: ' — the AiS connector is not connected in your Claude: ',
    connectorNote2: '. Without it, Claude has no ',
    connectorNote3: ' tool and cannot write the result here — that’s why it’s empty. Quick check: ask that same Claude “which AiS tools do you have?”. If none — connect the connector and retry.',
    connectAis: 'Connect the AiS connector →',
    recheckBtn: 'Check again',
    openClaudeAgain: 'Open Claude again',
    copyPromptBtn: 'Copy prompt',
    openBaseOnSite: 'Open base on the site →',
    pressEnterHint1: 'Also make sure you pressed ',
    pressEnterHint2: ' in the Claude tab. Once the result is saved — click “Check again”.',
    waitingResult: 'Waiting for the result from Claude…',
    step1a: 'In the open Claude tab press ',
    step1b: ' — the prompt is already filled in.',
    step2a: 'Claude will research and save the result to the base ',
    step2b: ' via the AiS connector.',
    step3: 'The result will appear here automatically (usually 1–3 minutes).',
    subHint1: 'You need the AiS connector connected in your Claude — ',
    linkHowConnect: 'how to connect',
    subHint2: '. The research runs on your subscription.',
    yourRuns: 'Your runs',
    emptyCanDelete: 'empty ones can be deleted — they were abandoned',
    tidyTitle: 'Move old runs into the “Research” folder',
    tidyBtn: 'Tidy up',
    runsRows: (n) => `${n} rows`,
    runsEmpty: 'empty',
    deleteRunTitle: 'Delete run to the bin',
  },
};

export default function Research() {
  const toast = useToast();
  const confirm = useConfirm();
  const { lang } = useLang();
  const [prompt, setPrompt] = useState('');

  // ── Variant C: research on the user's own Claude via a deeplink ──
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<{ baseId: string; baseName: string; web: string } | null>(null);
  // Your past runs, so an abandoned one is findable and removable instead of
  // sitting in the tree forever
  const [runs, setRuns] = useState<RunInfo[] | null>(null);
  // is the server-side research path switched on? (flag on the server)
  const [serverAgent, setServerAgent] = useState(false);
  // the result lands in the run base once Claude saves it; poll the base
  const [runRows, setRunRows] = useState<Array<Record<string, unknown>> | null>(null);
  // the base's columns — the aspect columns Claude chose drive the coverage view
  const [runColumns, setRunColumns] = useState<Array<{ key: string; label: string }>>([]);
  const [runTimedOut, setRunTimedOut] = useState(false);
  const [recheck, setRecheck] = useState(0);

  useEffect(() => {
    if (!run) return;
    let stop = false;
    const started = Date.now();
    setRunRows(null);
    setRunColumns([]);
    setRunTimedOut(false);
    const poll = async () => {
      while (!stop) {
        try {
          const b = await apiJson<{
            records?: Array<Record<string, unknown>>;
            columns?: Array<{ key: string; label: string }>;
          }>(`/api/records?base=${encodeURIComponent(run.baseId)}`);
          if (stop) return;
          if (Array.isArray(b.records) && b.records.length) {
            setRunRows(b.records);
            setRunColumns(b.columns ?? []);
            return;
          }
        } catch (e) {
          // the run base is gone (deleted from the tree, or never accessible) —
          // waiting five more minutes for it would be a lie
          if (e instanceof ApiError && e.status === 404) {
            if (!stop) { setRunTimedOut(true); toast(S[lang].runNotFound); }
            return;
          }
          /* transient poll error — swallow and retry, a toast here would spam */
        }
        if (Date.now() - started > 5 * 60 * 1000) { if (!stop) setRunTimedOut(true); return; }
        await new Promise((res) => setTimeout(res, 4000));
      }
    };
    poll();
    return () => { stop = true; };
  }, [run, recheck]);

  const loadRuns = useCallback(() => {
    apiJson<{ runs?: RunInfo[]; serverAgent?: boolean }>('/api/research/runs')
      .then((b) => { setRuns(b.runs ?? []); setServerAgent(!!b.serverAgent); })
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
      title: S[lang].deleteTitle(r.name),
      message: r.rows
        ? S[lang].deleteMsgRows(r.rows)
        : S[lang].deleteMsgEmpty,
      confirmLabel: S[lang].deleteConfirm,
      danger: true,
    });
    if (!ok) return;
    try {
      await apiSend('/api/bases', 'DELETE', { id: r.id });
      if (run?.baseId === r.id) setRun(null);
      loadRuns();
      toast(S[lang].runDeleted);
    } catch (e) {
      toast(e instanceof Error ? e.message : S[lang].runDeleteFailed);
    }
  };

  const tidy = async () => {
    try {
      const { moved } = await apiSend<{ moved: number }>('/api/research/runs', 'POST', {});
      loadRuns();
      toast(moved ? S[lang].tidied(moved) : S[lang].tidyNothing);
    } catch (e) {
      toast(e instanceof Error ? e.message : S[lang].tidyFailed);
    }
  };

  // if the Claude tab got closed, let the user grab the ready-made prompt again.
  // the full instruction is the q= payload of the deeplink — decode it back out.
  const copyPrompt = async () => {
    const q = run?.web.split('?q=')[1];
    const text = q ? decodeURIComponent(q) : prompt;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(S[lang].promptCopied);
    } catch {
      toast(S[lang].copyFailed);
    }
  };

  // Server-side research (roadmap step 3) — only offered when the flag is on.
  // Runs synchronously on our key and writes straight into a run base; the poll
  // below then shows the rows, same as the deeplink path.
  const startServer = async () => {
    if (!prompt.trim()) return;
    setStarting(true);
    try {
      const body = await apiSend<{ baseId: string; baseName: string; added: number }>(
        '/api/research/server',
        'POST',
        { prompt },
      );
      setRun({ baseId: body.baseId, baseName: body.baseName, web: '' });
      loadRuns();
      toast(S[lang].serverDone(body.added));
    } catch (e) {
      toast(e instanceof Error ? e.message : S[lang].serverStartFailed);
    } finally {
      setStarting(false);
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
      toast(e instanceof Error ? e.message : S[lang].startFailed);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          <span aria-hidden="true">←</span> {S[lang].backToCatalog}
        </Link>
        <div className={styles.headerActions}>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <h1 className={styles.title}>{S[lang].pageTitle}</h1>
        <p className={styles.lead}>{S[lang].lead}</p>

        <textarea
          className={styles.prompt}
          placeholder={S[lang].promptPlaceholder}
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
            title={S[lang].startClaudeTitle}
          >
            {starting ? S[lang].opening : <><IconSearch size={15} /> {S[lang].researchInMyClaude}</>}
          </button>
          {serverAgent && (
            <button
              type="button"
              className={styles.ghost}
              onClick={startServer}
              disabled={starting || !prompt.trim()}
              title={S[lang].startServerTitle}
            >
              {S[lang].researchOnServer}
            </button>
          )}
        </div>

        {run && (
          <section className={styles.claudeRun}>
            {runRows ? (
              /* the result arrived in the base — show it right here */
              <>
                <div className={styles.claudeRunTitle}><IconCheck size={16} /> {S[lang].doneFound(runRows.length)}</div>
                {(() => {
                  const s = scoreRows(runRows.map(extractRow));
                  const pct = (n: number) => Math.round(n * 100);
                  return (
                    <div className={styles.quality}>
                      <span className={styles.qBadge} title={S[lang].qLinksTitle}>
                        {S[lang].qLinks} {pct(s.linkRate)}%
                      </span>
                      <span className={styles.qBadge} title={S[lang].qQuotesTitle}>
                        {S[lang].qQuotes} {pct(s.quoteRate)}%
                      </span>
                      <span className={s.duplicateRows ? styles.qBadgeWarn : styles.qBadge} title={S[lang].qDuplicatesTitle}>
                        {S[lang].qDuplicates} {s.duplicateRows}
                      </span>
                      {s.emptyRows > 0 && (
                        <span className={styles.qBadgeWarn} title={S[lang].qEmptyTitle}>
                          {S[lang].qEmpty} {s.emptyRows}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const cov = aspectCoverage(runRows, runColumns);
                  if (!cov.length) return null;
                  const open = cov.filter((a) => !a.covered).length;
                  return (
                    <div className={styles.coverage}>
                      <span className={styles.coverageLabel}>
                        {S[lang].aspects}{open > 0 ? S[lang].aspectsNotCovered(open) : S[lang].aspectsAllCovered}
                      </span>
                      <div className={styles.coverageChips}>
                        {cov.map((a) => (
                          <span
                            key={a.key}
                            className={a.covered ? styles.aspectOn : styles.aspectOff}
                            title={S[lang].aspectFillTitle(a.filled, a.total)}
                          >
                            {a.label}
                            <span className={styles.aspectCount}>{a.filled}/{a.total}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <ul className={styles.runResults}>
                  {runRows.slice(0, 40).map((r, i) => {
                    const row = extractRow(r);
                    return (
                      <li key={i} className={styles.runResult}>
                        <div className={styles.runTop}>
                          <span className={styles.runName}>{row.name || '—'}</span>
                          {row.link ? (
                            <a className={styles.runUrl} href={row.link} target="_blank" rel="noreferrer" title={row.link}>↗</a>
                          ) : null}
                        </div>
                        {row.quote ? <span className={styles.runQuote}>«{row.quote}»</span> : null}
                      </li>
                    );
                  })}
                </ul>
                <div className={styles.claudeRunActions}>
                  <Link className={styles.primary} href={`/?base=${encodeURIComponent(run.baseId)}`}>{S[lang].openBase(run.baseName)}</Link>
                </div>
              </>
            ) : runTimedOut ? (
              /* nothing arrived within 5 minutes */
              <>
                <div className={styles.claudeRunTitle}>{S[lang].stillEmpty}</div>
                <div className={styles.connectorNote}>
                  <b>{S[lang].connectorCause}</b>{S[lang].connectorNote1}<b>AiS</b>{S[lang].connectorNote2}<code>add_rows</code>{S[lang].connectorNote3}
                </div>
                <div className={styles.claudeRunActions}>
                  <Link className={styles.primary} href="/connect">{S[lang].connectAis}</Link>
                  <button type="button" className={styles.ghost} onClick={() => setRecheck((n) => n + 1)}>{S[lang].recheckBtn}</button>
                  <a className={styles.ghost} href={run.web} target="_blank" rel="noreferrer">{S[lang].openClaudeAgain}</a>
                  <button type="button" className={styles.ghost} onClick={copyPrompt}>{S[lang].copyPromptBtn}</button>
                  <Link className={styles.ghost} href={`/?base=${encodeURIComponent(run.baseId)}`}>{S[lang].openBaseOnSite}</Link>
                </div>
                <p className={styles.claudeHint}>
                  {S[lang].pressEnterHint1}<b>Enter</b>{S[lang].pressEnterHint2}
                </p>
              </>
            ) : (
              /* waiting for Claude to write the result */
              <>
                <div className={styles.claudeRunTitle}><IconFlask size={16} /> {S[lang].waitingResult}</div>
                <ol className={styles.claudeSteps}>
                  <li>{S[lang].step1a}<b>Enter</b>{S[lang].step1b}</li>
                  <li>{S[lang].step2a}<b>«{run.baseName}»</b>{S[lang].step2b}</li>
                  <li>{S[lang].step3}</li>
                </ol>
                <ul className={styles.skeleton} aria-hidden="true">
                  <li className={styles.skelRow}><span className={styles.skelName} /><span className={styles.skelQuote} /></li>
                  <li className={styles.skelRow}><span className={styles.skelName} /><span className={styles.skelQuote} /></li>
                  <li className={styles.skelRow}><span className={styles.skelName} /><span className={styles.skelQuote} /></li>
                </ul>
                <div className={styles.claudeRunActions}>
                  <a className={styles.primary} href={run.web} target="_blank" rel="noreferrer">{S[lang].openClaudeAgain}</a>
                  <button type="button" className={styles.ghost} onClick={copyPrompt}>{S[lang].copyPromptBtn}</button>
                  <Link className={styles.ghost} href={`/?base=${encodeURIComponent(run.baseId)}`}>{S[lang].openBaseOnSite}</Link>
                </div>
                <p className={styles.claudeHint}>
                  {S[lang].subHint1}<Link href="/connect">{S[lang].linkHowConnect}</Link>{S[lang].subHint2}
                </p>
              </>
            )}
          </section>
        )}

        {runs && runs.length > 0 && (
          <section className={styles.runsBlock}>
            <div className={styles.runsHead}>
              <h2>{S[lang].yourRuns}</h2>
              {runs.some((r) => !r.rows) && (
                <span className={styles.runsHint}>{S[lang].emptyCanDelete}</span>
              )}
              <button type="button" className={styles.tidy} onClick={tidy} title={S[lang].tidyTitle}>
                {S[lang].tidyBtn}
              </button>
            </div>
            <ul className={styles.runsList}>
              {runs.map((r) => (
                <li key={r.id} className={styles.runsItem}>
                  <Link className={styles.runsName} href={`/?base=${encodeURIComponent(r.id)}`}>{r.name}</Link>
                  <span className={r.rows ? styles.runsRows : styles.runsEmpty}>
                    {r.rows ? S[lang].runsRows(r.rows) : S[lang].runsEmpty}
                  </span>
                  <button type="button" className={styles.runsDrop} onClick={() => dropRun(r)} title={S[lang].deleteRunTitle}>
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
