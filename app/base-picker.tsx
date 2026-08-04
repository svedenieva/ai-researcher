'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './base-picker.module.css';

export interface BaseTab {
  id: string;
  name: string;
  tone: string;
  builtin: boolean;
}

// порядок встроенных баз (Александр: AI-сфера → IT-сфера → WorkOS → Рынок AI)
const BUILTIN_ORDER = ['ai', 'it', 'workforce', 'market'];

export default function BasePicker({
  tabs,
  base,
  onChange,
  onCreate,
}: {
  tabs: BaseTab[];
  base: string;
  onChange: (id: string) => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // клик вне пикера — закрыть
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const builtin = tabs
    .filter((t) => t.builtin)
    .sort((a, b) => BUILTIN_ORDER.indexOf(a.id) - BUILTIN_ORDER.indexOf(b.id));
  const custom = tabs.filter((t) => !t.builtin);
  const current = tabs.find((t) => t.id === base);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const item = (t: BaseTab) => (
    <button
      key={t.id}
      type="button"
      className={`${styles.option} ${t.id === base ? styles.optionActive : ''}`}
      onClick={() => pick(t.id)}
    >
      <span className={`${styles.dot} ${styles[`dot_${t.tone}`] ?? styles.dot_sage}`} aria-hidden="true" />
      {t.name}
    </button>
  );

  return (
    <nav className={styles.crumbs} aria-label="Выбор базы" ref={ref}>
      {/* корневая крошка — сам бренд «AI-Researcher» в шапке (кликается домой) */}
      <span className={styles.sep} aria-hidden="true">›</span>

      <div className={styles.pickerWrap}>
        <button
          type="button"
          className={styles.pickerBtn}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className={`${styles.dot} ${styles[`dot_${current?.tone ?? 'sage'}`] ?? styles.dot_sage}`} aria-hidden="true" />
          {current?.name ?? 'База'}
          <span className={styles.caret} aria-hidden="true">▾</span>
        </button>

        {open && (
          <div className={styles.menu} role="menu">
            {builtin.map(item)}
            {custom.length > 0 && <div className={styles.menuLabel}>Мои базы</div>}
            {custom.map(item)}
            <div className={styles.menuDiv} />
            <button
              type="button"
              className={styles.create}
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              + Создать базу
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
