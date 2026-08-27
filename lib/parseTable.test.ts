import { describe, it, expect } from 'vitest';
import { parseTable, inferType } from './parseTable';

describe('parseTable — delimiter detection', () => {
  it('parses a comma CSV', () => {
    const t = parseTable('name,price\nSynthesia,29\nHeyGen,24');
    expect(t.headers).toEqual(['name', 'price']);
    expect(t.rows).toEqual([['Synthesia', '29'], ['HeyGen', '24']]);
  });

  it('parses a SEMICOLON CSV (Excel in a comma-decimal locale) — no longer one column', () => {
    const t = parseTable('Назва;Ціна\nSynthesia;29,99\nHeyGen;24,50');
    expect(t.headers).toEqual(['Назва', 'Ціна']);
    expect(t.rows).toEqual([['Synthesia', '29,99'], ['HeyGen', '24,50']]);
  });

  it('parses a TSV (paste from Sheets/Excel)', () => {
    const t = parseTable('name\tprice\nSynthesia\t29');
    expect(t.headers).toEqual(['name', 'price']);
    expect(t.rows).toEqual([['Synthesia', '29']]);
  });

  it('a comma inside a quoted field does not fool the semicolon sniff', () => {
    const t = parseTable('Назва;Опис\nX;"один, два, три"');
    expect(t.headers).toEqual(['Назва', 'Опис']);
    expect(t.rows).toEqual([['X', 'один, два, три']]);
  });

  it('strips a BOM and trailing newlines', () => {
    const t = parseTable('﻿a,b\n1,2\n\n');
    expect(t.headers).toEqual(['a', 'b']);
    expect(t.rows).toEqual([['1', '2']]);
  });

  it('handles CRLF and quoted newlines', () => {
    const t = parseTable('a,b\r\n"line\nbreak",2\r\n');
    expect(t.headers).toEqual(['a', 'b']);
    expect(t.rows).toEqual([['line\nbreak', '2']]);
  });
});

describe('inferType', () => {
  it('reads a comma-decimal column as number', () => {
    expect(inferType(['29,99', '24,50'])).toBe('number');
  });
  it('reads urls', () => {
    expect(inferType(['https://a.com', 'https://b.com'])).toBe('url');
  });
});
