import { describe, it, expect } from 'vitest';
import { resultToRows, buildPrompt } from './scrape';
import type { ColumnDef } from '../datasource/types';

const cols: ColumnDef[] = [
  { key: 'компания', label: 'Компания', type: 'text' },
  { key: 'угроза', label: 'Угроза', type: 'number' },
  { key: '__mode', label: 'Режим', type: 'select' },
];

describe('scrape: result → base rows', () => {
  it('maps an items[] array by label and coerces numbers; drops unknown fields', () => {
    const result = { items: [
      { 'Компания': 'Alpha', 'Угроза': '4', 'Лишнее': 'x' },
      { 'Компания': 'Beta', 'Угроза': '2' },
    ] };
    expect(resultToRows(cols, result)).toEqual([
      { 'компания': 'Alpha', 'угроза': 4 },
      { 'компания': 'Beta', 'угроза': 2 },
    ]);
  });

  it('handles a single object result (one row)', () => {
    expect(resultToRows(cols, { 'Компания': 'Solo' })).toEqual([{ 'компания': 'Solo' }]);
  });

  it('flattens array-valued fields to a comma string', () => {
    expect(resultToRows(cols, { items: [{ 'Компания': ['A', 'B'] }] })).toEqual([{ 'компания': 'A, B' }]);
  });

  it('buildPrompt lists the user column labels and excludes system columns', () => {
    const p = buildPrompt(cols);
    expect(p).toContain('"Компания"');
    expect(p).toContain('"Угроза"');
    expect(p).not.toContain('Режим');
  });
});
