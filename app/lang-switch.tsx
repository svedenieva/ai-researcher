'use client';

import { LANGS, t } from '@/lib/i18n';
import { useLang } from './lang-provider';
import styles from './lang-switch.module.css';

// Two shapes of the same control:
//  - "segments": the classic УКР | РУС | ENG group (used on the desktop toolbar).
//  - "cycle": one button that shows the current language and steps to the next
//    on each click (used in the tight responsive toolbar).
export default function LangSwitch({ variant = 'segments' }: { variant?: 'segments' | 'cycle' }) {
  const { lang, setLang } = useLang();

  if (variant === 'cycle') {
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

  return (
    <div className={styles.group} role="group" aria-label={t(lang, 'langTitle')} title={t(lang, 'langTitle')}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          className={`${styles.seg} ${lang === l.id ? styles.on : ''}`}
          aria-pressed={lang === l.id}
          onClick={() => setLang(l.id)}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
