'use client';

import type { ColumnDef, FilterState, MindSheetProps, Row } from './types';

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

  return (
    <div>
      {filterables.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {filterables.map((c) => (
            <label key={c.key} style={{ fontSize: 13 }}>
              {c.label}:{' '}
              <select
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
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  role="columnheader"
                  style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #dfe3ee', whiteSpace: 'nowrap' }}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(c.key)}
                      style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', padding: 0 }}
                    >
                      {c.label}
                      {sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f6', maxWidth: c.type === 'long-text' ? 320 : undefined, verticalAlign: 'top' }}
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
  if (value === null || value === undefined || value === '') return '—';
  if (col.type === 'url') {
    return <a href={String(value)} target="_blank" rel="noreferrer">{String(value)}</a>;
  }
  return String(value);
}
