'use client';

import type { CSSProperties } from 'react';
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

// fixed track widths (no fr — fr blows up under width:max-content with many
// columns). long-text gets a capped width and its text is clamped; the table
// scrolls horizontally when the columns don't fit.
function trackFor(column: ColumnDef, isFirst: boolean): string {
  if (isFirst) return '150px';
  if (column.type === 'long-text') return '240px';
  if (column.type === 'number') return '76px';
  if (column.type === 'url') return '160px';
  if (column.type === 'select') return '112px';
  return '124px';
}

export default function MindSheet({
  columns, records, sort, filter, filterOptions, onSortChange, onFilterChange,
}: MindSheetProps) {
  const filterables = columns.filter((c) => c.filterable);
  const firstKey = columns[0]?.key;

  const grid = columns.map((c, i) => trackFor(c, i === 0)).join(' ');
  const gridStyle = { '--grid': grid } as CSSProperties;

  return (
    <div className={styles.sheet}>
      <div className={styles.tableTools}>
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
        <div className={styles.table} style={gridStyle} role="table">
          <div className={styles.tableHead} role="row">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <div key={c.key} role="columnheader" className={styles.th}>
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
                </div>
              );
            })}
          </div>

          {records.length === 0 ? (
            <div className={styles.none}>Ничего не найдено</div>
          ) : (
            records.map((r) => (
              <div key={r.id} className={styles.row} role="row">
                {columns.map((c) => (
                  <div
                    key={c.key}
                    role="cell"
                    className={cx(
                      styles.td,
                      c.key === firstKey && styles.strong,
                      c.type === 'long-text' && styles.long,
                    )}
                  >
                    {renderCell(r[c.key], c)}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
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
