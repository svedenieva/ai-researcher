'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_LANG, type Lang } from '@/lib/i18n';

const STORAGE_KEY = 'lang';

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
}
const LangContext = createContext<Ctx>({ lang: DEFAULT_LANG, setLang: () => {} });

// Язык живёт в localStorage (клиентское приложение, без SSR-cookie). Стартуем с
// украинского и на сервере, и на клиенте — иначе разъедется гидрация; после
// монтирования подхватываем сохранённый выбор.
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'uk' || stored === 'ru' || stored === 'en') setLangState(stored);
    } catch {
      /* приватный режим — едем на языке по умолчанию */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* не сохранится — переживём */
    }
  };

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  return useContext(LangContext);
}
