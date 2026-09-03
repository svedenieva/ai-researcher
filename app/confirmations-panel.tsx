'use client';

import { useEffect, useRef, useState } from 'react';
import type { CatalogRecord, ColumnDef } from '@/lib/datasource/types';
import { t as tr, type Lang } from '@/lib/i18n';
import { countConfirmations, DEFAULT_THRESHOLD } from '@/lib/research/confirmations';
import styles from './confirmations-panel.module.css';

// ТР-ПА-01: перечень тезисов ветки с числом независимых подтверждающих
// источников, по убыванию, с настраиваемым порогом (по умолчанию 5).
export default function ConfirmationsPanel({
  records,
  columns,
  lang,
}: {
  records: CatalogRecord[];
  columns: ColumnDef[];
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const rows = countConfirmations(records, columns, { threshold });
  const passed = rows.filter((r) => r.passes).length;

  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {tr(lang, 'caButton' as Parameters<typeof tr>[1])}
      </button>
      {open && (
        <div className={styles.panel} role="dialog">
          <div className={styles.head}>
            <span className={styles.title}>{tr(lang, 'caTitle' as Parameters<typeof tr>[1])}</span>
            <label className={styles.thr}>
              {tr(lang, 'caThreshold' as Parameters<typeof tr>[1])}
              <input type="number" min={1} max={99} value={threshold} onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </div>
          <div className={styles.sub}>
            {passed} {tr(lang, 'caPassed' as Parameters<typeof tr>[1])} · {rows.length}
          </div>
          {rows.length === 0 ? (
            <div className={styles.empty}>{tr(lang, 'caEmpty' as Parameters<typeof tr>[1])}</div>
          ) : (
            <ul className={styles.list}>
              {rows.slice(0, 60).map((r) => (
                <li key={r.thesis} className={`${styles.item} ${r.passes ? styles.pass : ''}`} title={r.sources.join(', ')}>
                  <span className={styles.count}>{r.count}</span>
                  <span className={styles.name}>{r.thesis}</span>
                  {r.passes && <span className={styles.tick}>✓</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
