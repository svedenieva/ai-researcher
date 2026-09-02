'use client';

import { useMemo } from 'react';
import type { ColumnDef, CatalogRecord } from '@/lib/datasource/types';
import { useLang } from './lang-provider';
import type { Lang } from '@/lib/i18n';
import styles from './base-summary.module.css';

const S: Record<Lang, { total: string; recent: string }> = {
  uk: { total: 'усього', recent: 'за 30 дн' },
  ru: { total: 'всего', recent: 'за 30 дн' },
  en: { total: 'total', recent: 'in 30d' },
};

const isSystem = (k: string) => k.startsWith('__');
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

// Compact inline metrics shown next to the mode tabs (Все / Эталон …): total
// rows, average of a rating column, edits in the last 30 days, and the funnel
// counts by the board's select column. Plain text — no card. Follows the rows
// on screen, so it reflects the active filters/search.
export default function BaseSummary({
  columns, records, total,
}: {
  columns: ColumnDef[];
  records: CatalogRecord[];
  total?: number;
}) {
  const { lang } = useLang();
  const s = S[lang] ?? S.ru;

  const metrics = useMemo(() => {
    const funnelCol =
      columns.find((c) => c.type === 'select' && c.defaultGroup && !isSystem(c.key)) ??
      columns.find((c) => c.type === 'select' && c.badge && !isSystem(c.key));
    const ratingCol = columns.find((c) => c.type === 'rating' && !isSystem(c.key));
    const dateCol = columns.find((c) => c.type === 'date' && !isSystem(c.key));

    let funnel: { value: string; count: number }[] | null = null;
    if (funnelCol) {
      const counts = new Map<string, number>();
      for (const r of records) {
        const v = String(r[funnelCol.key] ?? '').trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const ordered = [...(funnelCol.order ?? []), ...[...counts.keys()].filter((v) => !(funnelCol.order ?? []).includes(v))];
      funnel = ordered.filter((v) => counts.has(v)).map((v) => ({ value: v, count: counts.get(v) ?? 0 }));
    }

    let avg: number | null = null;
    if (ratingCol) {
      const vals = records.map((r) => num(r[ratingCol.key])).filter((n) => Number.isFinite(n) && n > 0);
      if (vals.length) avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    let recent: number | null = null;
    const whenOf = (r: CatalogRecord): number => {
      const u = (r as Record<string, unknown>).__updated;
      if (u) { const t = Date.parse(String(u)); if (Number.isFinite(t)) return t; }
      if (dateCol) { const t = Date.parse(String(r[dateCol.key] ?? '')); if (Number.isFinite(t)) return t; }
      return NaN;
    };
    if (records.some((r) => Number.isFinite(whenOf(r)))) {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      recent = records.filter((r) => { const t = whenOf(r); return Number.isFinite(t) && t >= cutoff; }).length;
    }

    return { funnel, avg, recent };
  }, [columns, records]);

  const totalN = total ?? records.length;

  return (
    <div className={styles.inline}>
      <span className={styles.metric}><b>{totalN}</b> {s.total}</span>
      {metrics.avg != null && <span className={styles.metric}>★ {metrics.avg.toFixed(1)}</span>}
      {metrics.recent != null && <span className={styles.metric}><b>{metrics.recent}</b> {s.recent}</span>}
      {metrics.funnel?.map((f) => (
        <span key={f.value} className={styles.metric}>{f.value} <b>{f.count}</b></span>
      ))}
    </div>
  );
}
