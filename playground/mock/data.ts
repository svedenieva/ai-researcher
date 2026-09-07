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
const kbRows: CatalogRecord[] = [
  { id: 'k1', name: 'Claude Code', __tags: 'AI, разработка', stage: 'внедрение', rating: 5, ready: 'да', link: 'https://claude.com/claude-code', 'Введение': 'Агент-программист в терминале и IDE.', 'Настройка': '- войти /login\n- /design-login\n- открыть репо' },
  { id: 'k2', name: 'Cursor', __tags: 'AI, разработка', stage: 'изучение', rating: 4, ready: '', link: 'https://cursor.com', 'Введение': 'Редактор кода с ИИ.', 'Настройка': '' },
  { id: 'k3', name: 'Fathom', __tags: 'встречи, заметки', stage: 'обучение', rating: 5, ready: 'да', link: 'https://fathom.video', 'Введение': 'Запись и конспект созвонов.', 'Настройка': '- поставить расширение\n- подключить календарь' },
  { id: 'k4', name: 'Supabase', __tags: 'база данных, backend', stage: 'проверка', rating: 4, ready: 'да', link: 'https://supabase.com', 'Введение': 'Postgres + auth + API.', 'Настройка': '' },
  { id: 'k5', name: 'Vercel', __tags: 'деплой, хостинг', stage: 'инструкция', rating: 5, ready: 'да', link: 'https://vercel.com', 'Введение': 'Деплой фронтенда из репозитория.', 'Настройка': '- vercel --prod' },
];

export const MOCK_BASES: MockBase[] = [
  { id: 'market', name: 'Каталог AI', tone: 'blue', builtin: true, parent: null, owner: null, columns: catalogColumns, records: catalogRows },
  { id: 'kb', name: 'База знаний', tone: 'teal', builtin: false, parent: null, owner: 'me@aivocado', state: 'in_progress', query: 'инструменты команды', columns: kbColumns, records: kbRows },
  { id: 'kb-ai', name: 'AI-инструменты', tone: 'sage', builtin: false, parent: 'kb', owner: 'me@aivocado', state: 'closed', query: 'модели и агенты', columns: kbColumns, records: kbRows.slice(0, 2) },
];

export const DEFAULT_MOCK_BASE = 'market';
