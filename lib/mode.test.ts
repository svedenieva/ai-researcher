import { describe, it, expect } from 'vitest';
import { MODE_RESEARCH, MODE_REFERENCE, recordMode, MODE_KEY } from './mode';

// The customer's ТЗ vocabulary. Labels are display-only: stored records keep
// whatever value they were written with, and recordMode() maps every historical
// spelling onto the current pair on read — so no data migration is needed.
describe('mode labels — ТЗ vocabulary', () => {
  it('are Исследование / Эталон', () => {
    expect(MODE_RESEARCH).toBe('Исследование');
    expect(MODE_REFERENCE).toBe('Эталон');
  });
});

describe('recordMode — every historical stored value maps correctly', () => {
  const of = (v?: string) => recordMode(v === undefined ? {} : { [MODE_KEY]: v });

  it('reference: Эталон (original + current) and Проверено (the intermediate rename) → REFERENCE', () => {
    expect(of('Эталон')).toBe(MODE_REFERENCE);
    expect(of('Проверено')).toBe(MODE_REFERENCE);
    expect(of(MODE_REFERENCE)).toBe(MODE_REFERENCE);
  });

  it('research / absent / unknown → RESEARCH', () => {
    expect(of('Черновик')).toBe(MODE_RESEARCH); // intermediate research spelling
    expect(of('Исследование')).toBe(MODE_RESEARCH);
    expect(of(undefined)).toBe(MODE_RESEARCH); // old rows, catalog rows
    expect(of('мусор')).toBe(MODE_RESEARCH);
  });
});
