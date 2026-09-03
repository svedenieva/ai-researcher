'use client';

import { useEffect, useRef, useState } from 'react';
import type { CatalogRecord, ColumnDef } from '@/lib/datasource/types';
import { t as tr, type Lang } from '@/lib/i18n';
import { stageReport } from '@/lib/knowledge-stages';
import styles from './stages-panel.module.css';

// ТР-БЗ-09: вид «Стадии внедрения» — сколько записей на какой стадии и сколько
// там времени (средний возраст с последнего изменения).
export default function StagesPanel({
  records,
  columns,
  lang,
}: {
  records: CatalogRecord[];
  columns: ColumnDef[];
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const rep = stageReport(records, columns);
  if (!rep.stageKey) return null; // показываем кнопку только когда есть стадии

  const max = Math.max(1, ...rep.buckets.map((b) => b.count));
  const T = (k: string) => tr(lang, k as Parameters<typeof tr>[1]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {T('stButton')}
      </button>
      {open && (
        <div className={styles.panel} role="dialog">
          <div className={styles.title}>{T('stTitle')}</div>
          <ul className={styles.list}>
            {rep.buckets.map((b) => (
              <li key={b.stage} className={styles.row}>
                <span className={styles.stage}>{b.stage}</span>
                <span className={styles.barTrack}>
                  <span className={styles.bar} style={{ width: `${(b.count / max) * 100}%` }} />
                </span>
                <span className={styles.count}>{b.count}</span>
                <span className={styles.days}>{b.avgDays !== null ? `${b.avgDays} ${T('stDays')}` : '—'}</span>
              </li>
            ))}
          </ul>
          {rep.noStage > 0 && <div className={styles.note}>⚠ {rep.noStage} {T('stNoStage')}</div>}
        </div>
      )}
    </div>
  );
}
