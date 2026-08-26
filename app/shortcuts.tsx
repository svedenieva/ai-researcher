'use client';

// A tiny keyboard layer: «?» opens a help overlay, «/» jumps to the global
// search, Esc closes. We stay out of the way while typing in a field.
import { useEffect, useState } from 'react';
import { useLang } from './lang-provider';
import { t as tr } from '@/lib/i18n';
import styles from './shortcuts.module.css';

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export default function Shortcuts() {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('global-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={() => setOpen(false)}>
      <div className={styles.card} role="dialog" aria-label={tr(lang, 'scTitle')} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>{tr(lang, 'scTitle')}</h2>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label={tr(lang, 'scClose')}>×</button>
        </div>
        <dl className={styles.list}>
          <div className={styles.row}><dt><kbd className={styles.kbd}>/</kbd></dt><dd>{tr(lang, 'scSearch')}</dd></div>
          <div className={styles.row}><dt><kbd className={styles.kbd}>?</kbd></dt><dd>{tr(lang, 'scHelp')}</dd></div>
          <div className={styles.row}><dt><kbd className={styles.kbd}>Esc</kbd></dt><dd>{tr(lang, 'scClose')}</dd></div>
        </dl>
        <div className={styles.tips}>
          <p>{tr(lang, 'scSort')}</p>
          <p>{tr(lang, 'scView')}</p>
        </div>
      </div>
    </div>
  );
}
