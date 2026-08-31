'use client';

import { LANGS, t } from '@/lib/i18n';
import { useLang } from './lang-provider';
import styles from './lang-switch.module.css';

// One button that cycles the interface language on each click:
// УКР → РУС → ENG → УКР. It shows the current language.
export default function LangSwitch() {
  const { lang, setLang } = useLang();
  const idx = LANGS.findIndex((l) => l.id === lang);
  const current = LANGS[idx] ?? LANGS[0];
  const next = LANGS[(idx + 1) % LANGS.length] ?? LANGS[0];
  return (
    <button
      type="button"
      className={styles.cycle}
      title={`${t(lang, 'langTitle')} → ${next.short}`}
      aria-label={`${t(lang, 'langTitle')}: ${current.short}`}
      onClick={() => setLang(next.id)}
    >
      {current.short}
    </button>
  );
}
