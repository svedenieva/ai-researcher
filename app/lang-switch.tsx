'use client';

import { LANGS, t } from '@/lib/i18n';
import { useLang } from './lang-provider';
import styles from './lang-switch.module.css';

// Переключатель языка: сегментами УКР | РУС | ENG. Украинский — базовый.
export default function LangSwitch() {
  const { lang, setLang } = useLang();
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
