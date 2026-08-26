'use client';

// AI actions on the current custom base — opens the user's own Claude (Variant C)
// with a ready prompt that reads this base via the connector. Read-only: the
// answer lives in the user's Claude chat, nothing is written back here.
import { useState } from 'react';
import { useLang } from './lang-provider';
import { t as tr } from '@/lib/i18n';
import { askBase, findGaps, summarize, fillColumn } from '@/lib/research/base-actions';
import { IconFlask } from './icons';
import styles from './base-ai-actions.module.css';

interface Col { key: string; label: string }

export default function BaseAiActions({ baseId, baseName, columns = [] }: { baseId: string; baseName: string; columns?: Col[] }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [fillCol, setFillCol] = useState('');
  // fillable = the base's own columns, minus system ones (__source, __mode, …)
  const fillable = columns.filter((c) => c.label && !c.key.startsWith('__'));

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

            {fillable.length > 0 && (
              <form
                className={styles.fillRow}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (fillCol) go(fillColumn(baseId, baseName, fillCol));
                }}
              >
                <select className={styles.select} value={fillCol} onChange={(e) => setFillCol(e.target.value)} aria-label={tr(lang, 'aiFill')}>
                  <option value="">{tr(lang, 'aiFillPick')}</option>
                  {fillable.map((c) => (
                    <option key={c.key} value={c.label}>{c.label}</option>
                  ))}
                </select>
                <button type="submit" className={styles.ask} disabled={!fillCol}>
                  {tr(lang, 'aiFillBtn')}
                </button>
              </form>
            )}

            <p className={styles.note}>{tr(lang, 'aiNote')}</p>
            {fillable.length > 0 && <p className={styles.warn}>⚠ {tr(lang, 'aiFillNote')}</p>}
          </div>
        </>
      )}
    </div>
  );
}
