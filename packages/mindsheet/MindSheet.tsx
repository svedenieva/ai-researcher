'use client';

import type { ColumnDef, MindSheetProps, Row } from './types';
import styles from './MindSheet.module.css';

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function distinct(records: Row[], key: string): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const v = r[key];
    if (v !== null && v !== undefined && v !== '') set.add(String(v));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

export default function MindSheet({
  columns, records, sort, filter, filterOptions, onSortChange, onFilterChange,
}: MindSheetProps) {
  const filterables = columns.filter((c) => c.filterable);
  const firstKey = columns[0]?.key;

  return (
    <div className={styles.sheet}>
      <div className={styles.toolbar}>
        {filterables.map((c) => (
          <label key={c.key} className={styles.filter}>
            {c.label}:
            <select
              className={styles.select}
              aria-label={`Фильтр ${c.label}`}
              value={filter?.key === c.key ? filter.value : ''}
              onChange={(e) =>
                onFilterChange(
                  e.target.value ? { key: c.key, value: e.target.value } : undefined,
                )
              }
            >
              <option value="">Все</option>
              {(filterOptions?.[c.key] ?? distinct(records, c.key)).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        <span className={styles.count}>{records.length} записей</span>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} role="columnheader" className={styles.th}>
                    {c.sortable ? (
                      <button
                        type="button"
                        className={styles.colHead}
                        data-active={active || undefined}
                        onClick={() => onSortChange(c.key)}
                      >
                        {c.label}
                        <span className={styles.arrow}>
                          {active ? (sort!.dir === 'asc' ? '▲' : '▼') : ''}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      styles.td,
                      c.key === firstKey && styles.strong,
                      c.type === 'long-text' && styles.long,
                    )}
                  >
                    {renderCell(r[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(value: Row[string], col: ColumnDef) {
  if (value === null || value === undefined || value === '') {
    return <span className={styles.empty}>—</span>;
  }
  if (col.type === 'url') {
    return (
      <a className={styles.link} href={String(value)} target="_blank" rel="noreferrer">
        {String(value)}
      </a>
    );
  }
  return String(value);
}
