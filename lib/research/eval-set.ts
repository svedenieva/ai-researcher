// The measure set — 10–15 real questions with what a good answer must cover.
// Used to get a baseline before changing the research engine (roadmap step 1–2).
// `subtopics` are the aspects a strong answer touches; `note` is the human read
// of "good". Keep these realistic to the catalog (AI / IT / WorkOS products).

export interface EvalQuestion {
  id: string;
  question: string;
  subtopics: string[];
  note?: string;
}

export const EVAL_QUESTIONS: EvalQuestion[] = [
  {
    id: 'video-editing',
    question: 'AI-инструменты для видеомонтажа',
    subtopics: ['автомонтаж', 'субтитры', 'генерация видео', 'озвучка', 'цена', 'кому подходит'],
    note: 'И редакторы (Descript, CapCut), и генераторы (Runway, Pika); честно про бесплатные лимиты.',
  },
  {
    id: 'synthesia-competitors',
    question: 'Конкуренты Synthesia: AI-аватары и говорящие головы',
    subtopics: ['аватары', 'языки/локализация', 'клонирование голоса', 'цена', 'корпоративное использование'],
    note: 'HeyGen, D-ID, Colossyan и др.; чем отличаются от Synthesia.',
  },
  {
    id: 'sales-agents',
    question: 'AI-агенты для продаж и аутрича',
    subtopics: ['поиск лидов', 'персонализация писем', 'CRM-интеграции', 'автопоследовательности', 'цена'],
  },
  {
    id: 'image-gen',
    question: 'Инструменты генерации изображений на AI',
    subtopics: ['качество', 'стилизация', 'редактирование/inpaint', 'права на изображения', 'API', 'цена'],
  },
  {
    id: 'copywriting',
    question: 'AI-инструменты для копирайтинга и контента',
    subtopics: ['длинные тексты', 'SEO', 'тон бренда', 'языки', 'детект AI-контента', 'цена'],
  },
  {
    id: 'meeting-notes',
    question: 'AI для расшифровки и конспектов встреч',
    subtopics: ['точность транскрипции', 'саммари', 'action items', 'интеграции', 'приватность', 'цена'],
    note: 'Fathom, Otter, Fireflies; важна тема приватности данных встреч.',
  },
  {
    id: 'nocode-ai',
    question: 'No-code платформы со встроенным AI',
    subtopics: ['автоматизации', 'AI-шаги', 'интеграции', 'лимиты', 'цена'],
  },
  {
    id: 'support-chatbots',
    question: 'AI-чатботы для поддержки клиентов',
    subtopics: ['обучение на базе знаний', 'передача оператору', 'многоязычность', 'аналитика', 'цена'],
  },
  {
    id: 'seo-ai',
    question: 'AI-инструменты для SEO',
    subtopics: ['подбор ключей', 'кластеризация', 'генерация контента', 'аудит', 'цена'],
  },
  {
    id: 'deep-research',
    question: 'Инструменты для глубокого AI-ресёрча',
    subtopics: ['источники и цитаты', 'глубина', 'экспорт', 'проверяемость', 'цена'],
    note: 'Perplexity, Elicit, Consensus; ключевое — качество и проверяемость источников.',
  },
  {
    id: 'presentations',
    question: 'AI-инструменты для создания презентаций',
    subtopics: ['генерация из текста', 'шаблоны/дизайн', 'экспорт', 'совместная работа', 'цена'],
  },
  {
    id: 'rag-infra',
    question: 'Инфраструктура для RAG: векторные базы и поиск',
    subtopics: ['векторные БД', 'гибридный поиск', 'масштабирование', 'хостинг vs self-host', 'цена'],
  },
  {
    id: 'coding-assistants',
    question: 'AI-ассистенты для программирования',
    subtopics: ['автодополнение', 'чат-помощник', 'поддержка языков', 'приватность кода', 'интеграции с IDE', 'цена'],
    note: 'Copilot, Cursor, Claude Code и др.; тема приватности кода критична для команд.',
  },
  {
    id: 'voice-tts',
    question: 'AI-озвучка и синтез речи (TTS)',
    subtopics: ['качество голосов', 'клонирование голоса', 'языки', 'эмоции/интонации', 'лицензия', 'цена'],
  },
  {
    id: 'data-bi',
    question: 'AI для анализа данных и BI',
    subtopics: ['подключение источников', 'запросы на естественном языке', 'визуализация', 'точность', 'приватность', 'цена'],
  },
];

export function questionById(id: string): EvalQuestion | undefined {
  return EVAL_QUESTIONS.find((q) => q.id === id);
}
