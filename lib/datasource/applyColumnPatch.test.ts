import { describe, it, expect } from 'vitest';
import { applyColumnPatch } from './customStore';
import type { ColumnDef } from './types';

const numCol: ColumnDef = { key: 'price', label: 'Цена', type: 'number' };

describe('applyColumnPatch — numberFormat', () => {
  it('stores a currency format on a number column', () => {
    const out = applyColumnPatch(numCol, { numberFormat: { style: 'currency', decimals: 2, currency: '$' } });
    expect(out.numberFormat).toEqual({ style: 'currency', decimals: 2, currency: '$' });
  });

  it('drops a plain/no-op format (default state is stored as undefined)', () => {
    const out = applyColumnPatch(numCol, { numberFormat: { style: 'plain', decimals: 0 } });
    expect(out.numberFormat).toBeUndefined();
  });

  it('keeps plain when it carries decimals', () => {
    const out = applyColumnPatch(numCol, { numberFormat: { style: 'plain', decimals: 2 } });
    expect(out.numberFormat).toEqual({ style: 'plain', decimals: 2 });
  });

  it('clears the format when the column stops being a number', () => {
    const withFmt: ColumnDef = { ...numCol, numberFormat: { style: 'percent' } };
    const out = applyColumnPatch(withFmt, { type: 'text' });
    expect(out.numberFormat).toBeUndefined();
  });

  it('leaves an existing format untouched when the patch omits it', () => {
    const withFmt: ColumnDef = { ...numCol, numberFormat: { style: 'thousands' } };
    const out = applyColumnPatch(withFmt, { label: 'Стоимость' });
    expect(out.numberFormat).toEqual({ style: 'thousands' });
    expect(out.label).toBe('Стоимость');
  });
});
