import { describe, it, expect } from 'vitest';
import { mapImportRows } from './importTable';
import { toMarkdownTable } from './markdownTable';
import { parseTable } from './parseTable';
import type { ColumnDef } from './datasource/types';

const columns: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text' },
  { key: 'цена', label: 'Цена', type: 'number' },
  { key: 'режим', label: 'Режим', type: 'select' },
  { key: '__mode', label: 'Режим-сис', type: 'select' }, // system column — never imported
];

describe('mapImportRows — .md/.csv round-trip back into the same base', () => {
  it('maps headers to columns by label and coerces by the base type', () => {
    const { rows, matched, unmatched } = mapImportRows(
      columns,
      ['Название', 'Цена', 'Режим'],
      [['Figma', '15', 'Исследование'], ['Notion', '10', 'Эталон']],
    );
    expect(matched).toEqual(['Название', 'Цена', 'Режим']);
    expect(unmatched).toEqual([]);
    expect(rows).toEqual([
      { название: 'Figma', цена: 15, режим: 'Исследование' },
      { название: 'Notion', цена: 10, режим: 'Эталон' },
    ]);
  });

  it('reports headers that do not match any column (their values are dropped)', () => {
    const { rows, unmatched } = mapImportRows(columns, ['Название', 'Лишнее'], [['A', 'x']]);
    expect(unmatched).toEqual(['Лишнее']);
    expect(rows).toEqual([{ название: 'A' }]);
  });

  it('closes the round-trip: export → parse → map returns the original values', () => {
    const table = {
      headers: ['Название', 'Цена', 'Режим'],
      rows: [['Figma', 15, 'Исследование'], ['Notion', 10, 'Эталон']],
    };
    const md = toMarkdownTable(table);
    const parsed = parseTable(md);
    const mapped = mapImportRows(columns, parsed.headers, parsed.rows);
    expect(mapped.rows).toEqual([
      { название: 'Figma', цена: 15, режим: 'Исследование' },
      { название: 'Notion', цена: 10, режим: 'Эталон' },
    ]);
  });
});
