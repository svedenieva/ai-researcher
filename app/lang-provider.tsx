'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_LANG, type Lang } from '@/lib/i18n';

const STORAGE_KEY = 'lang';

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
}
const LangContext = createContext<Ctx>({ lang: DEFAULT_LANG, setLang: () => {} });

// The language lives in localStorage (client-side app, no SSR cookie). We start
// with Ukrainian on both the server and the client — otherwise hydration would
// mismatch; after mounting we pick up the saved choice.
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'uk' || stored === 'ru' || stored === 'en') setLangState(stored);
    } catch {
      /* private mode — fall back to the default language */
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
      /* won't persist — we'll live with it */
    }
  };

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  return useContext(LangContext);
}
