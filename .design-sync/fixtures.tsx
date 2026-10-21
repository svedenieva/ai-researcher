// Shared preview data. One realistic knowledge base — «AI-агенты» — shaped so
// every panel finds what it looks for: StagesPanel needs a column matching
// /стад|stage|этап/ carrying the five canonical stages, SourceCounters needs a
// «тип» column plus url columns, BaseSummary needs a defaultGroup select and a
// rating column, ConfirmationsPanel needs link columns across distinct domains.
// Content is real products in the catalog's own domain — never foo/bar.
import { useEffect, useRef, type ReactNode } from 'react';

export const COLUMNS = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  {
    key: 'vertical',
    label: 'Вертикаль',
    type: 'select',
    filterable: true,
    badge: true,
    order: ['Кодинг', 'Ресёрч', 'Дизайн', 'Продажи'],
  },
  {
    key: 'verdict',
    label: 'Вердикт',
    type: 'select',
    filterable: true,
    badge: true,
    defaultGroup: true,
    order: ['Берём', 'Смотрим', 'Мимо'],
    badgeVariant: { 'Берём': 'green', 'Смотрим': 'amber', 'Мимо': 'grey' },
  },
  { key: 'stage', label: 'Стадия', type: 'select', filterable: true },
  { key: 'kind', label: 'Тип источника', type: 'select', filterable: true },
  { key: 'source', label: 'Источник', type: 'url' },
  { key: 'rating', label: 'Оценка', type: 'rating', sortable: true },
  { key: 'note', label: 'Заметка', type: 'long-text' },
] as const;

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const RECORDS = [
  {
    id: 'r1', name: 'Cursor', vertical: 'Кодинг', verdict: 'Берём', stage: 'внедрение',
    kind: 'Репозиторий', source: 'https://github.com/getcursor/cursor', rating: 5,
    note: 'Редактор с агентным режимом. Команда уже сидит на нём — осталось описать инструкцию.',
    __updated: days(4),
  },
  {
    id: 'r2', name: 'Linear', vertical: 'Продажи', verdict: 'Берём', stage: 'обучение',
    kind: 'Страница', source: 'https://linear.app/docs', rating: 5,
    note: 'Трекер задач. Внедрён, идёт обучение команды.', __updated: days(11),
  },
  {
    id: 'r3', name: 'Perplexity', vertical: 'Ресёрч', verdict: 'Смотрим', stage: 'изучение',
    kind: 'Страница', source: 'https://www.perplexity.ai', rating: 4,
    note: 'Поиск с цитатами. Пока не ясно, чем лучше связки «поиск + модель».',
    __updated: days(2),
  },
  {
    id: 'r4', name: 'ElevenLabs', vertical: 'Продажи', verdict: 'Смотрим', stage: 'изучение',
    kind: 'Канал', source: 'https://www.youtube.com/@elevenlabsio', rating: 3,
    note: 'Синтез речи. Нужен для озвучки демо, но цена на объёме кусается.',
    __updated: days(19),
  },
  {
    id: 'r5', name: 'LangGraph', vertical: 'Кодинг', verdict: 'Смотрим', stage: 'проверка',
    kind: 'Репозиторий', source: 'https://github.com/langchain-ai/langgraph', rating: 3,
    note: 'Графы агентов. Проверяем на нашем пайплайне — пока сыровато.',
    __updated: days(7),
  },
  {
    id: 'r6', name: 'Figma Make', vertical: 'Дизайн', verdict: 'Берём', stage: 'инструкция',
    kind: 'Страница', source: 'https://www.figma.com/make/', rating: 4,
    note: 'Генерация макетов. Пишем памятку дизайнеру.', __updated: days(1),
  },
  {
    id: 'r7', name: 'Weights & Biases', vertical: 'Ресёрч', verdict: 'Мимо', stage: 'изучение',
    kind: 'Репозиторий', source: 'https://github.com/wandb/wandb', rating: 2,
    note: 'Трекинг экспериментов. Избыточно для нашего масштаба.', __updated: days(41),
  },
  {
    id: 'r8', name: 'Андрей Карпатый', vertical: 'Ресёрч', verdict: 'Берём', stage: 'обучение',
    kind: 'Эксперт', source: 'https://www.linkedin.com/in/andrej-karpathy/', rating: 5,
    note: 'Лекции по LLM — базовый материал для онбординга.', __updated: days(9),
  },
  {
    id: 'r9', name: 'Supabase', vertical: 'Кодинг', verdict: 'Берём', stage: 'внедрение',
    kind: 'Репозиторий', source: 'https://github.com/supabase/supabase', rating: 5,
    note: 'Наша база и авторизация. Внедрено.', __updated: days(3),
  },
  {
    id: 'r10', name: 'Гліб Кудрявцев', vertical: 'Дизайн', verdict: 'Смотрим', stage: 'изучение',
    kind: 'Эксперт', source: 'https://www.linkedin.com/in/hlib-kudriavtsev/', rating: 4,
    note: 'Практика дизайн-систем. Позвать на консультацию.', __updated: days(26),
  },
  {
    id: 'r11', name: 'Telegram-канал «Сиолошная»', vertical: 'Ресёрч', verdict: 'Берём', stage: 'изучение',
    kind: 'Канал', source: 'https://t.me/seeallochnaya', rating: 4,
    note: 'Разборы статей. Читаем еженедельно.', __updated: days(6),
  },
  {
    id: 'r12', name: 'Vercel AI SDK', vertical: 'Кодинг', verdict: 'Смотрим', stage: 'проверка',
    kind: 'Репозиторий', source: 'https://github.com/vercel/ai', rating: 4,
    note: 'Стриминг ответов на фронте. Сверяем с нашим текущим решением.',
    __updated: days(14),
  },
] as const;

// ConfirmationsPanel groups by thesis (the name column) and counts DISTINCT
// source domains, so a meaningful card needs the same thesis backed from
// several hosts — one row per (thesis, source).
export const CONFIRMATION_ROWS = [
  { id: 'c1', name: 'Агентные редакторы вытесняют автодополнение', source: 'https://github.com/getcursor/cursor' },
  { id: 'c2', name: 'Агентные редакторы вытесняют автодополнение', source: 'https://www.anthropic.com/news' },
  { id: 'c3', name: 'Агентные редакторы вытесняют автодополнение', source: 'https://stackoverflow.blog/survey' },
  { id: 'c4', name: 'Агентные редакторы вытесняют автодополнение', source: 'https://www.jetbrains.com/research/' },
  { id: 'c5', name: 'Агентные редакторы вытесняют автодополнение', source: 'https://survey.stackoverflow.co' },
  { id: 'c6', name: 'Агентные редакторы вытесняют автодополнение', source: 'https://arxiv.org/abs/2402.00001' },
  { id: 'c7', name: 'Дизайн-системы переезжают в код', source: 'https://www.figma.com/blog/' },
  { id: 'c8', name: 'Дизайн-системы переезжают в код', source: 'https://storybook.js.org/blog/' },
  { id: 'c9', name: 'Дизайн-системы переезжают в код', source: 'https://m3.material.io' },
  { id: 'c10', name: 'Голосовые агенты готовы к продажам', source: 'https://elevenlabs.io/blog' },
  { id: 'c11', name: 'Голосовые агенты готовы к продажам', source: 'https://openai.com/index/' },
] as const;

export const TABS = [
  { id: 'ai', name: 'AI', tone: 'sage', builtin: true, parent: null },
  { id: 'agents', name: 'AI-агенты', tone: 'teal', builtin: false, parent: 'ai', state: 'in_progress', query: 'какие агентные среды готовы к продакшену' },
  { id: 'agents-code', name: 'Кодинг-агенты', tone: 'teal', builtin: false, parent: 'agents', state: 'in_progress' },
  { id: 'agents-voice', name: 'Голосовые агенты', tone: 'amber', builtin: false, parent: 'agents', state: 'unexplored' },
  { id: 'design', name: 'Дизайн-инструменты', tone: 'blue', builtin: false, parent: 'ai', state: 'closed' },
  { id: 'it', name: 'IT', tone: 'sage', builtin: true, parent: null },
  { id: 'infra', name: 'Инфраструктура', tone: 'sage', builtin: false, parent: 'it', state: 'in_progress' },
] as const;

export const PARENTS = TABS.filter((t) => !t.parent || t.builtin).map((t) => ({ id: t.id, name: t.name }));

export const noop = () => {};

/**
 * Panels in this product open on click and hold their open state internally,
 * so a static render would only ever show the closed trigger — the least
 * interesting half. This clicks the trigger once after mount so the card shows
 * the panel the way a person actually sees it. Programmatic .click() fires no
 * document mousedown, so the panels' click-outside handlers stay quiet.
 */
export function AutoOpen({ children, selector = 'button' }: { children: ReactNode; selector?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const trigger = ref.current?.querySelector<HTMLElement>(selector);
    trigger?.click();
  }, [selector]);
  return <div ref={ref}>{children}</div>;
}

/**
 * Some surfaces have no trigger to click — Shortcuts renders null until a `?`
 * keydown reaches window. This fires that key once after mount so the card
 * shows the dialog instead of an empty cell.
 */
export function PressKey({ children, keyName = '?' }: { children: ReactNode; keyName?: string }) {
  useEffect(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true }));
  }, [keyName]);
  return <>{children}</>;
}

/**
 * Stage for the drop-down panels. Every one of them anchors its panel with
 * `right: 0` (widths 284-420px), so a trigger sitting at x=0 drops its panel
 * off the left edge of the card. This gives the trigger a right-aligned stage
 * wide enough for the panel to open inward, and tall enough not to be cropped.
 */
export function PanelStage({
  children,
  width = 480,
  height = 320,
}: { children: ReactNode; width?: number; height?: number }) {
  return (
    <div style={{ width, height, display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
      <AutoOpen>{children}</AutoOpen>
    </div>
  );
}
