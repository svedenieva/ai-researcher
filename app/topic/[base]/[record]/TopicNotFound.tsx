'use client';

import Link from 'next/link';
import ThemeToggle from '../../../theme-toggle';
import { useLang } from '../../../lang-provider';
import styles from './article.module.css';

const S = {
  uk: {
    title: 'Тему не знайдено',
    text: 'Схоже, цей запис видалено. Якщо це сталося помилково, його можна повернути з кошика.',
    back: (name: string) => `← Повернутися до бази «${name}»`,
  },
  ru: {
    title: 'Тема не найдена',
    text: 'Похоже, эта запись удалена. Если это произошло по ошибке, её можно вернуть из корзины.',
    back: (name: string) => `← Вернуться в базу «${name}»`,
  },
  en: {
    title: 'Topic not found',
    text: 'This record was probably deleted. If that was a mistake, you can restore it from the bin.',
    back: (name: string) => `← Back to «${name}»`,
  },
} as const;

// Shown by the topic route when the base is accessible but the row is gone
// (usually deleted). A client component so it can follow the selected language.
export default function TopicNotFound({ baseId, baseName }: { baseId: string; baseName: string }) {
  const { lang } = useLang();
  const t = S[lang];
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href={`/?base=${encodeURIComponent(baseId)}`} className={styles.back}>
          <span aria-hidden="true">←</span> {baseName}
        </Link>
        <div className={styles.headerActions}>
          <ThemeToggle />
        </div>
      </header>
      <main className={styles.body}>
        <div className={styles.missing}>
          <h1 className={styles.missingTitle}>{t.title}</h1>
          <p className={styles.missingText}>{t.text}</p>
          <Link href={`/?base=${encodeURIComponent(baseId)}`} className={styles.missingBack}>
            {t.back(baseName)}
          </Link>
        </div>
      </main>
    </div>
  );
}
