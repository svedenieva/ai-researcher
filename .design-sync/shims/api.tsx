// Shim for `@/lib/api` inside the Claude Design bundle. The real one calls the
// backend over fetch; outside the app there is no backend, so the page would
// render empty (or error). Here apiJson answers the read endpoints the dashboard
// hits on mount with realistic catalog data, and apiSend (mutations) is a no-op.
// This is what turns the full page into a live, editable design — not a blank grid.
import { CATALOG_COLUMNS } from '../../lib/datasource/columns';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// A dozen real catalog rows, shaped for CATALOG_COLUMNS keys.
const ROWS = [
  { id: 'n8n', name: 'n8n', section: 'WorkOS', verdict: 'Инструмент', pop: 'Высокая', vertical: 'Автоматизация', region: 'EU', country: 'Германия', founded: 2019, grade: 'E1 · подтверждено', url: 'https://n8n.io', pricing: 'Free (self-host) / Cloud', traction: '50k+ звёзд', description: 'Визуальная автоматизация воркфлоу с self-host и кодом.' },
  { id: 'zapier', name: 'Zapier', section: 'WorkOS', verdict: 'Инструмент', pop: 'Высокая', vertical: 'Автоматизация', region: 'US', country: 'США', founded: 2011, grade: 'E1 · подтверждено', url: 'https://zapier.com', pricing: 'Freemium', traction: '2M+ пользователей', description: 'No-code интеграции между приложениями по триггер-действие.' },
  { id: 'vercel', name: 'Vercel', section: 'IT', verdict: 'Инструмент', pop: 'Высокая', vertical: 'Разработка ПО', region: 'US', country: 'США', founded: 2015, grade: 'E1 · подтверждено', url: 'https://vercel.com', pricing: 'Freemium', traction: 'Хостинг Next.js', description: 'Хостинг фронтенда: деплой из репозитория, preview-окружения.' },
  { id: 'cursor', name: 'Cursor', section: 'IT', verdict: 'Строить своё', pop: 'Высокая', vertical: 'Разработка ПО', region: 'US', country: 'США', founded: 2022, grade: 'E2 · надёжно', url: 'https://cursor.com', pricing: 'Freemium', traction: 'Быстрый рост', description: 'Редактор кода с агентным режимом.' },
  { id: 'perplexity', name: 'Perplexity', section: 'AI', verdict: 'Мониторить', pop: 'Высокая', vertical: 'Ресёрч', region: 'US', country: 'США', founded: 2022, grade: 'E2 · надёжно', url: 'https://perplexity.ai', pricing: 'Freemium', traction: '10M+ MAU', description: 'Поиск с цитатами на базе LLM.' },
  { id: 'langgraph', name: 'LangGraph', section: 'AI', verdict: 'Инструмент', pop: 'Средняя', vertical: 'Агенты', region: 'US', country: 'США', founded: 2023, grade: 'E4 · оценка', url: 'https://langchain-ai.github.io/langgraph/', pricing: 'Open source', traction: 'Растёт', description: 'Фреймворк для графов агентов поверх LangChain.' },
  { id: 'midjourney', name: 'Midjourney', section: 'AI', verdict: 'Инструмент', pop: 'Высокая', vertical: 'Производство контента', region: 'US', country: 'США', founded: 2021, grade: 'E1 · подтверждено', url: 'https://midjourney.com', pricing: 'Подписка', traction: '20M+ пользователей', description: 'Генерация изображений по текстовому описанию.' },
  { id: 'linear', name: 'Linear', section: 'WorkOS', verdict: 'Строить своё', pop: 'Средняя', vertical: 'Продажи', region: 'US', country: 'США', founded: 2019, grade: 'E2 · надёжно', url: 'https://linear.app', pricing: 'Freemium', traction: 'Популярен у стартапов', description: 'Трекер задач и планирование для продуктовых команд.' },
  { id: 'supabase', name: 'Supabase', section: 'IT', verdict: 'Инструмент', pop: 'Высокая', vertical: 'Разработка ПО', region: 'Global', country: 'Сингапур', founded: 2020, grade: 'E1 · подтверждено', url: 'https://supabase.com', pricing: 'Freemium', traction: 'Open-source Firebase', description: 'Postgres-бэкенд как сервис: база, auth, storage.' },
  { id: 'elevenlabs', name: 'ElevenLabs', section: 'AI', verdict: 'Мониторить', pop: 'Средняя', vertical: 'Производство контента', region: 'US', country: 'США', founded: 2022, grade: 'E4 · оценка', url: 'https://elevenlabs.io', pricing: 'Freemium', traction: 'Лидер синтеза речи', description: 'Синтез и клонирование голоса.' },
];

function reply(url: string): unknown {
  const path = String(url).split('?')[0];
  if (path.includes('/api/records')) {
    return { columns: CATALOG_COLUMNS, records: ROWS, total: ROWS.length, facets: {} };
  }
  if (path.includes('/api/bases')) return { bases: [] };
  if (path.includes('/api/favorites')) return { favorites: [] };
  return {};
}

export async function apiJson<T = unknown>(input: RequestInfo | URL): Promise<T> {
  return reply(String(input)) as T;
}

export function apiSend<T = unknown>(): Promise<T> {
  // Mutations are inert in the design mockup.
  return Promise.resolve({} as T);
}
