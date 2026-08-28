import { describe, it, expect } from 'vitest';
import { coerceToNumber } from './coerce';

// The honest type-conversion the market survey praised in Airtable: switching a
// column to «number» turns parseable values into real numbers (so sorting and
// totals work), and LEAVES the rest as-is — nothing is silently dropped.
describe('coerceToNumber', () => {
  it('parses plain and comma-decimal numbers', () => {
    expect(coerceToNumber('42')).toBe(42);
    expect(coerceToNumber('29,99')).toBe(29.99);
    expect(coerceToNumber('-5')).toBe(-5);
  });
  it('keeps a value that will not become a number, rather than losing it', () => {
    expect(coerceToNumber('n/a')).toBe('n/a');
    expect(coerceToNumber('$50')).toBe('$50');
  });
  it('passes null / undefined / empty / already-number through unchanged', () => {
    expect(coerceToNumber(null)).toBeNull();
    expect(coerceToNumber(undefined)).toBeUndefined();
    expect(coerceToNumber('')).toBe('');
    expect(coerceToNumber('   ')).toBe('   ');
    expect(coerceToNumber(7)).toBe(7);
  });
});
