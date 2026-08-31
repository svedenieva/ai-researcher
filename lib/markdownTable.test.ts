import { describe, it, expect } from 'vitest';
import { toMarkdownTable } from './markdownTable';
import { parseTable } from './parseTable';

describe('toMarkdownTable — round-trips through the Markdown import', () => {
  const table = {
    headers: ['Назва', 'Ціна', 'Нотатки'],
    rows: [
      ['Figma', '15', 'дизайн-інструмент'],
      ['Slack', '8', 'чат'],
    ],
  };

  it('emits a valid Markdown table (header, separator, data rows)', () => {
    const md = toMarkdownTable(table);
    const lines = md.split('\n');
    expect(lines[0]).toBe('| Назва | Ціна | Нотатки |');
    expect(lines[1]).toBe('| --- | --- | --- |');
    expect(lines[2]).toBe('| Figma | 15 | дизайн-інструмент |');
  });

  it('re-imports to exactly the same headers and rows', () => {
    const back = parseTable(toMarkdownTable(table));
    expect(back.headers).toEqual(table.headers);
    expect(back.rows).toEqual(table.rows);
  });

  it('escapes pipes so a value with «|» survives the round-trip', () => {
    const t = { headers: ['A', 'B'], rows: [['x|y', 'z']] };
    const md = toMarkdownTable(t);
    expect(md).toContain('x\\|y');
    expect(parseTable(md).rows).toEqual([['x|y', 'z']]);
  });

  it('flattens newlines in a cell (Markdown tables are single-line) without breaking the table', () => {
    const t = { headers: ['A'], rows: [['line1\nline2']] };
    const back = parseTable(toMarkdownTable(t));
    expect(back.rows).toEqual([['line1 line2']]);
  });
});
