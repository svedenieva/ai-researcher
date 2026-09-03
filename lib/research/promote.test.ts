import { describe, it, expect } from 'vitest';
import { canPromote } from './promote';
import { CHECK_COLUMN } from './links';
import type { CatalogRecord, ColumnDef } from '../datasource/types';

const cols: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text' },
  { key: 'цитата', label: 'Цитата', type: 'long-text' },
  { key: 'источники', label: 'Источники', type: 'long-text' },
  { key: CHECK_COLUMN.key, label: CHECK_COLUMN.label, type: 'text' },
];
const rec = (o: Partial<CatalogRecord>): CatalogRecord => ({ id: 'r', ...o }) as CatalogRecord;

describe('canPromote', () => {
  it('allows a row with a quote and a working link', () => {
    expect(canPromote(rec({ цитата: 'verbatim', источники: 'https://a.com/x' }), cols)).toEqual({ ok: true });
  });

  it('blocks without a quote', () => {
    expect(canPromote(rec({ источники: 'https://a.com' }), cols)).toEqual({ ok: false, reason: 'no-quote' });
  });

  it('blocks without a fetchable link', () => {
    expect(canPromote(rec({ цитата: 'q', источники: 'not a url' }), cols)).toEqual({ ok: false, reason: 'no-link' });
    // private/loopback host is not fetchable
    expect(canPromote(rec({ цитата: 'q', источники: 'http://127.0.0.1/x' }), cols).ok).toBe(false);
  });

  it('blocks when the link check has failed', () => {
    expect(canPromote(rec({ цитата: 'q', источники: 'https://a.com', [CHECK_COLUMN.key]: 'битая ссылка ✗' }), cols)).toEqual({ ok: false, reason: 'check-failed' });
  });
});
