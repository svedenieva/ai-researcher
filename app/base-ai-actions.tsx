'use client';

// AI actions on the current custom base — opens the user's own Claude (Variant C)
// with a ready prompt that reads this base via the connector. Read-only: the
// answer lives in the user's Claude chat, nothing is written back here.
import { useState } from 'react';
import { useLang } from './lang-provider';
import { t as tr } from '@/lib/i18n';
import { askBase, findGaps, summarize } from '@/lib/research/base-actions';
import { IconFlask } from './icons';
import styles from './base-ai-actions.module.css';

export default function BaseAiActions({ baseId, baseName }: { baseId: string; baseName: string }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const go = (l: { web: string }) => {
    window.open(l.web, '_blank', 'noopener,noreferrer');
    setOpen(false);
    setQ('');
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={tr(lang, 'aiActions')}
      >
        <IconFlask size={14} /> {tr(lang, 'aiActions')}
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={styles.menu} role="dialog" aria-label={tr(lang, 'aiActions')}>
            <form
              className={styles.askRow}
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) go(askBase(baseId, baseName, q.trim()));
              }}
            >
              <input
                className={styles.input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tr(lang, 'aiAskPlaceholder')}
                autoFocus
              />
              <button type="submit" className={styles.ask} disabled={!q.trim()}>
                {tr(lang, 'aiAskBtn')}
              </button>
            </form>

            <button type="button" className={styles.item} onClick={() => go(findGaps(baseId, baseName))}>
              {tr(lang, 'aiGaps')}
            </button>
            <button type="button" className={styles.item} onClick={() => go(summarize(baseId, baseName))}>
              {tr(lang, 'aiSummary')}
            </button>

            <p className={styles.note}>{tr(lang, 'aiNote')}</p>
          </div>
        </>
      )}
    </div>
  );
}
