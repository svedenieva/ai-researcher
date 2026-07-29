'use client';

import type { CatalogRecord } from '@/lib/datasource/types';
import styles from './stats.module.css';

// cycles through the six segment tokens defined in globals.css — verticals
// are a dynamic, open-ended facet, not a fixed enum like meeting types
const SEG_TOKENS = ['--seg-1', '--seg-2', '--seg-3', '--seg-4', '--seg-5', '--seg-6'];

function distinctCount(records: CatalogRecord[], key: string): number {
  const set = new Set<string>();
  for (const r of records) {
    const v = r[key];
    if (v !== null && v !== undefined && v !== '') set.add(String(v));
  }
  return set.size;
}

// a compact band of key numbers above the table — a quick "state of the
// catalog" read. All values are derived client-side from the loaded records.
export default function Stats({ records }: { records: CatalogRecord[] }) {
  const tiles = [
    { label: 'Продуктов', value: records.length },
    { label: 'Регионов', value: distinctCount(records, 'region') },
    { label: 'Вертикалей', value: distinctCount(records, 'vertical') },
    { label: 'Грейдов', value: distinctCount(records, 'grade') },
  ];

  const verticalCount = new Map<string, number>();
  for (const r of records) {
    const v = r.vertical;
    if (v === null || v === undefined || v === '') continue;
    const key = String(v);
    verticalCount.set(key, (verticalCount.get(key) ?? 0) + 1);
  }
  const verticals = [...verticalCount.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count);
  const verticalTotal = verticals.reduce((sum, v) => sum + v.count, 0);

  return (
    <section className={styles.wrap} aria-label="Статистика каталога">
      <div className={styles.tiles}>
        {tiles.map((t) => (
          <div key={t.label} className={styles.tile}>
            <span className={styles.value}>{t.value}</span>
            <span className={styles.label}>{t.label}</span>
          </div>
        ))}
      </div>

      {verticals.length > 0 && (
        <div className={styles.types}>
          <div className={styles.bar}>
            {verticals.map((v, i) => (
              <span
                key={v.key}
                className={styles.seg}
                style={{
                  width: `${(v.count / verticalTotal) * 100}%`,
                  background: `var(${SEG_TOKENS[i % SEG_TOKENS.length]})`,
                }}
                title={`${v.label}: ${v.count}`}
              />
            ))}
          </div>
          <div className={styles.legend}>
            {verticals.map((v, i) => (
              <span key={v.key} className={styles.legendItem}>
                <span
                  className={styles.dot}
                  style={{ background: `var(${SEG_TOKENS[i % SEG_TOKENS.length]})` }}
                />
                {v.label}
                <span className={styles.legendCount}>{v.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
