'use client';

import type { CatalogRecord, ColumnDef } from '@/lib/datasource/types';
import { t as tr, type Lang } from '@/lib/i18n';
import { countSources, normMet, SOURCE_NORMS, type SourceKind } from '@/lib/source-counters';
import styles from './source-counters.module.css';

// ТР-БИ-06: полоска счётчиков по категориям источников направления, с отметкой
// о достижении норматива (≥10 экспертов, ≥20 репозиториев).
const ROWS: Array<{ kind: SourceKind; key: string }> = [
  { kind: 'experts', key: 'scExperts' },
  { kind: 'repos', key: 'scRepos' },
  { kind: 'channels', key: 'scChannels' },
  { kind: 'pages', key: 'scPages' },
];

export default function SourceCounters({
  records,
  columns,
  lang,
}: {
  records: CatalogRecord[];
  columns: ColumnDef[];
  lang: Lang;
}) {
  if (!records.length) return null;
  const counts = countSources(records, columns);
  return (
    <div className={styles.bar} role="group" aria-label="источники">
      {ROWS.map(({ kind, key }) => {
        const norm = SOURCE_NORMS[kind];
        const met = normMet(kind, counts);
        return (
          <span key={kind} className={`${styles.item} ${met === true ? styles.met : met === false ? styles.under : ''}`}>
            <span className={styles.label}>{tr(lang, key as Parameters<typeof tr>[1])}</span>
            <b className={styles.num}>{counts[kind]}</b>
            {norm !== undefined && (
              <span className={styles.norm} title={met ? tr(lang, 'scNormMet' as Parameters<typeof tr>[1]) : `/ ${norm}`}>
                {met ? '✓' : `/${norm}`}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
