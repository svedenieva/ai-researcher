'use client';

import { useMemo, useState, useEffect } from 'react';
import type { ColumnDef, CatalogRecord } from '@/lib/datasource/types';
import { useLang } from './lang-provider';
import type { Lang } from '@/lib/i18n';
import styles from './base-summary.module.css';

const S: Record<Lang, { title: string; total: string; avg: string; updated30: string; show: string; hide: string }> = {
  uk: { title: 'Зведення', total: 'Усього', avg: 'Середня оцінка', updated30: 'Оновлень за 30 днів', show: 'Показати зведення', hide: 'Сховати зведення' },
  ru: { title: 'Сводка', total: 'Всего', avg: 'Средняя оценка', updated30: 'Обновлений за 30 дней', show: 'Показать сводку', hide: 'Скрыть сводку' },
  en: { title: 'Summary', total: 'Total', avg: 'Average rating', updated30: 'Updates in 30 days', show: 'Show summary', hide: 'Hide summary' },
};

const isSystem = (k: string) => k.startsWith('__');
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

// A compact per-base dashboard: total rows, the average of a rating column, how
// many rows changed a date column in the last 30 days, and a breakdown (funnel)
// by the board's select column. Everything is derived from the rows on screen,
// so it follows the current filters/search — no separate query needed.
export default function BaseSummary({
  columns, records, total,
}: {
  columns: ColumnDef[];
  records: CatalogRecord[];
  total?: number;
}) {
  const { lang } = useLang();
  const s = S[lang] ?? S.ru;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { const v = localStorage.getItem('baseSummaryOpen'); if (v != null) setOpen(v === '1'); } catch {}
  }, []);
  const toggle = () => setOpen((o) => { const n = !o; try { localStorage.setItem('baseSummaryOpen', n ? '1' : '0'); } catch {} return n; });

  const metrics = useMemo(() => {
    // the funnel column: the board's grouping select, else the first badged select
    const funnelCol =
      columns.find((c) => c.type === 'select' && c.defaultGroup && !isSystem(c.key)) ??
      columns.find((c) => c.type === 'select' && c.badge && !isSystem(c.key));
    const ratingCol = columns.find((c) => c.type === 'rating' && !isSystem(c.key));
    const dateCol = columns.find((c) => c.type === 'date' && !isSystem(c.key));

    let funnel: { label: string; value: string; count: number; variant: string }[] | null = null;
    if (funnelCol) {
      const counts = new Map<string, number>();
      for (const r of records) {
        const v = String(r[funnelCol.key] ?? '').trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      // keep the column's declared order first, then any extra values seen
      const ordered = [...(funnelCol.order ?? []), ...[...counts.keys()].filter((v) => !(funnelCol.order ?? []).includes(v))];
      funnel = ordered
        .filter((v) => counts.has(v))
        .map((v) => ({ label: funnelCol.label, value: v, count: counts.get(v) ?? 0, variant: funnelCol.badgeVariant?.[v] ?? 'grey' }));
    }

    let avg: number | null = null;
    if (ratingCol) {
      const vals = records.map((r) => num(r[ratingCol.key])).filter((n) => Number.isFinite(n) && n > 0);
      if (vals.length) avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    let recent: number | null = null;
    if (dateCol) {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      recent = records.filter((r) => { const t = Date.parse(String(r[dateCol.key] ?? '')); return Number.isFinite(t) && t >= cutoff; }).length;
    }

    return { funnel, avg, recent, ratingLabel: ratingCol?.label, dateLabel: dateCol?.label };
  }, [columns, records]);

  const totalN = total ?? records.length;

  return (
    <section className={styles.wrap} aria-label={s.title}>
      <button type="button" className={styles.head} onClick={toggle} aria-expanded={open}>
        <span className={styles.caret} aria-hidden="true">{open ? '▾' : '▸'}</span>
        {s.title}
      </button>
      {open && (
        <div className={styles.body}>
          <div className={styles.tiles}>
            <div className={styles.tile}><span className={styles.num}>{totalN}</span><span className={styles.lbl}>{s.total}</span></div>
            {metrics.avg != null && (
              <div className={styles.tile}><span className={styles.num}>★ {metrics.avg.toFixed(1)}</span><span className={styles.lbl}>{metrics.ratingLabel ?? s.avg}</span></div>
            )}
            {metrics.recent != null && (
              <div className={styles.tile}><span className={styles.num}>{metrics.recent}</span><span className={styles.lbl}>{s.updated30}</span></div>
            )}
          </div>
          {metrics.funnel && metrics.funnel.length > 0 && (
            <div className={styles.funnel}>
              {metrics.funnel.map((f) => (
                <span key={f.value} className={`${styles.pill} ${styles[`v_${f.variant}`] ?? ''}`}>
                  {f.value} <b>{f.count}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
