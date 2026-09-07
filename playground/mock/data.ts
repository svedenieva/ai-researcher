// Мок-данные для playground: настоящие компоненты исследователя рендерятся на
// этих данных, без Supabase/Next. Ничего не уходит на сервер.
import type { CatalogRecord, ColumnDef } from '@/lib/datasource/types';

export interface MockBase {
  id: string;
  name: string;
  tone: 'sage' | 'teal' | 'blue' | 'amber';
  builtin: boolean;
  parent: string | null;
  owner: string | null;
  state?: 'unexplored' | 'in_progress' | 'closed' | null;
  query?: string | null;
  columns: ColumnDef[];
  records: CatalogRecord[];
}

const catalogColumns: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  {
    key: 'vertical', label: 'Вертикаль', type: 'select', sortable: true, filterable: true, badge: true,
    badgeVariant: { AI: 'purple', IT: 'blue', WorkOS: 'teal', Data: 'amber' },
  },
  {
    key: 'verdict', label: 'Вердикт', type: 'select', sortable: true, filterable: true, badge: true,
    order: ['Берём', 'Смотрим', 'Мимо'], badgeVariant: { 'Берём': 'green', 'Смотрим': 'amber', 'Мимо': 'grey' },
  },
  { key: 'price', label: 'Цена, $/мес', type: 'number', sortable: true },
  { key: 'link', label: 'Ссылка', type: 'url' },
  { key: 'note', label: 'Заметка', type: 'long-text' },
];
const catalogRows: CatalogRecord[] = [
  { id: 'c1', name: 'Figma', vertical: 'IT', verdict: 'Берём', price: 15, link: 'https://figma.com', note: 'Дизайн-файлы и прототипы.' },
  { id: 'c2', name: 'Linear', vertical: 'WorkOS', verdict: 'Берём', price: 8, link: 'https://linear.app', note: 'Трекер задач с нормальным API.' },
  { id: 'c3', name: 'Notion', vertical: 'WorkOS', verdict: 'Смотрим', price: 10, link: 'https://notion.so', note: 'База знаний.' },
  { id: 'c4', name: 'Airtable', vertical: 'Data', verdict: 'Смотрим', price: 20, link: 'https://airtable.com', note: 'Таблицы как база.' },
  { id: 'c5', name: 'Anthropic Claude', vertical: 'AI', verdict: 'Берём', price: 20, link: 'https://claude.ai', note: 'Основная модель.' },
  { id: 'c6', name: 'Supabase', vertical: 'Data', verdict: 'Берём', price: 25, link: 'https://supabase.com', note: 'Postgres + auth + API.' },
  { id: 'c7', name: 'Vercel', vertical: 'IT', verdict: 'Берём', price: 20, link: 'https://vercel.com', note: 'Деплой фронтенда.' },
  { id: 'c8', name: 'Retool', vertical: 'IT', verdict: 'Мимо', price: 50, link: 'https://retool.com', note: 'Внутренние админки.' },
];

const kbColumns: ColumnDef[] = [
  { key: 'name', label: 'Инструмент', type: 'text', sortable: true },
  { key: '__tags', label: 'Теги', type: 'multiselect', filterable: true, badge: true },
  {
    key: 'stage', label: 'Стадия', type: 'select', sortable: true, filterable: true, badge: true,
    order: ['изучение', 'внедрение', 'инструкция', 'обучение', 'проверка'],
    badgeVariant: { 'изучение': 'grey', 'внедрение': 'amber', 'инструкция': 'blue', 'обучение': 'purple', 'проверка': 'green' },
  },
  { key: 'rating', label: 'Оценка', type: 'rating', sortable: true },
  { key: 'ready', label: 'Готово', type: 'checkbox' },
  { key: 'link', label: 'Ссылка', type: 'url' },
  { key: 'Введение', label: 'Введение', type: 'long-text' },
  { key: 'Настройка', label: 'Настройка', type: 'long-text' },
];
// __mode делит записи на «Исследование» (черновик) и «Эталон» (проверено),
// чтобы вкладки Все / Исследование / Эталон показывали разные срезы (ТР-БД-13).
const kbRows: CatalogRecord[] = [
  { id: 'k1', name: 'Claude Code', __mode: 'Эталон', __tags: 'AI, разработка', stage: 'проверка', rating: 5, ready: 'да', link: 'https://claude.com/claude-code', 'Введение': 'Агент-программист в терминале и IDE.', 'Настройка': '- войти /login\n- /design-login\n- открыть репо' },
  { id: 'k2', name: 'Cursor', __mode: 'Исследование', __tags: 'AI, разработка', stage: 'изучение', rating: 4, ready: '', link: 'https://cursor.com', 'Введение': 'Редактор кода с ИИ.', 'Настройка': '' },
  { id: 'k3', name: 'Fathom', __mode: 'Эталон', __tags: 'встречи, заметки', stage: 'обучение', rating: 5, ready: 'да', link: 'https://fathom.video', 'Введение': 'Запись и конспект созвонов.', 'Настройка': '- расширение\n- календарь' },
  { id: 'k4', name: 'Supabase', __mode: 'Исследование', __tags: 'база данных, backend', stage: 'внедрение', rating: 4, ready: '', link: 'https://supabase.com', 'Введение': 'Postgres + auth + API.', 'Настройка': '' },
  { id: 'k5', name: 'Vercel', __mode: 'Исследование', __tags: 'деплой, хостинг', stage: 'инструкция', rating: 5, ready: 'да', link: 'https://vercel.com', 'Введение': 'Деплой фронтенда из репозитория.', 'Настройка': '- vercel --prod' },
  { id: 'k6', name: 'n8n', __mode: 'Исследование', __tags: 'автоматизация', stage: 'изучение', rating: 3, ready: '', link: 'https://n8n.io', 'Введение': 'Ноды-автоматизации.', 'Настройка': '' },
];

const meetColumns: ColumnDef[] = [
  { key: 'name', label: 'Встреча', type: 'text', sortable: true },
  { key: 'date', label: 'Дата', type: 'date', sortable: true },
  {
    key: 'kind', label: 'Тип', type: 'select', sortable: true, filterable: true, badge: true,
    badgeVariant: { 'Планёрка': 'blue', 'WorkOS': 'purple', 'Клиент': 'green', '1:1': 'grey' },
  },
  { key: 'importance', label: 'Важность', type: 'rating', sortable: true },
  { key: 'mins', label: 'Минут', type: 'number', sortable: true },
];
const meetRows: CatalogRecord[] = [
  { id: 'm1', name: 'Планёрка команды', date: '2026-09-07', kind: 'Планёрка', importance: 4, mins: 25 },
  { id: 'm2', name: 'WorkOS — методология', date: '2026-09-05', kind: 'WorkOS', importance: 5, mins: 62 },
  { id: 'm3', name: 'Клиент: AI-исследователь', date: '2026-09-04', kind: 'Клиент', importance: 5, mins: 48 },
  { id: 'm4', name: '1:1 с куратором', date: '2026-09-02', kind: '1:1', importance: 3, mins: 30 },
];

export const MOCK_BASES: MockBase[] = [
  // витрина-каталог (встроенная, только чтение)
  { id: 'market', name: 'Каталог AI', tone: 'blue', builtin: true, parent: null, owner: null, columns: catalogColumns, records: catalogRows },
  // база знаний с режимами Исследование/Эталон + вложенные темы
  { id: 'kb', name: 'База знаний', tone: 'teal', builtin: false, parent: null, owner: 'me@aivocado', state: 'in_progress', query: 'инструменты команды', columns: kbColumns, records: kbRows },
  { id: 'kb-ai', name: 'AI-инструменты', tone: 'sage', builtin: false, parent: 'kb', owner: 'me@aivocado', state: 'closed', query: 'модели и агенты', columns: kbColumns, records: kbRows.filter((r) => String(r.__tags).includes('AI')) },
  { id: 'kb-infra', name: 'Инфраструктура', tone: 'sage', builtin: false, parent: 'kb', owner: 'me@aivocado', state: 'unexplored', query: 'база, деплой', columns: kbColumns, records: kbRows.filter((r) => /backend|деплой/.test(String(r.__tags))) },
  // встречи Fathom (другой набор колонок)
  { id: 'fathom', name: 'Встречи Fathom', tone: 'amber', builtin: false, parent: null, owner: 'me@aivocado', state: 'in_progress', query: 'созвоны', columns: meetColumns, records: meetRows },
  // пустая база — экран «первый запуск»
  { id: 'drafts', name: 'Черновики (пусто)', tone: 'sage', builtin: false, parent: null, owner: 'me@aivocado', state: 'unexplored', query: 'новые идеи', columns: kbColumns, records: [] },
];

export const DEFAULT_MOCK_BASE = 'market';
