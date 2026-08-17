import { describe, it, expect } from 'vitest';
import { attachmentHeader, csvField, rowsFor, toCsv, UTF8_BOM, csvBytes } from './csv';
import { parseTable } from './parseTable';

// We check exactly the seven RFC 4180 rules written out in the research notes.
describe('RFC 4180 — serialization', () => {
  it('rule 1: records are separated by CRLF', () => {
    const csv = toCsv({ headers: ['a', 'b'], rows: [['1', '2'], ['3', '4']] });
    expect(csv).toBe('a,b\r\n1,2\r\n3,4');
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('rule 2: there is no trailing line break', () => {
    expect(toCsv({ headers: ['a'], rows: [['1']] }).endsWith('\r\n')).toBe(false);
  });

  it('rule 3: headers are the first line, in the same format', () => {
    const csv = toCsv({ headers: ['имя, полное', 'b'], rows: [['x', 'y']] });
    expect(csv.split('\r\n')[0]).toBe('"имя, полное",b');
  });

  it('rule 4: fields are separated by commas', () => {
    expect(toCsv({ headers: ['a', 'b', 'c'], rows: [] })).toBe('a,b,c');
  });

  it('rule 5: no quotes are added without special characters', () => {
    expect(csvField('простой текст')).toBe('простой текст');
    expect(csvField(42)).toBe('42');
  });

  it('rule 6: comma, quote and line break require quoting', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('стро\r\nка')).toBe('"стро\r\nка"');
    expect(csvField('одна\nстрока')).toBe('"одна\nстрока"');
    expect(csvField('он сказал "да"')).toBe('"он сказал ""да"""');
  });

  it('rule 7: a quote inside a field is doubled', () => {
    expect(csvField('"')).toBe('""""');
    expect(csvField('a"b"c')).toBe('"a""b""c"');
  });

  it('empty and missing values produce an empty field', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField('')).toBe('');
  });
});

describe('table export', () => {
  const columns = [{ key: 'name' }, { key: 'note' }, { key: 'pop' }];

  it('lays out records in column order, gaps left empty', () => {
    const rows = rowsFor(columns, [
      { name: 'Figma', note: 'дизайн', pop: 3 },
      { name: 'Coda' },
    ]);
    expect(rows).toEqual([
      ['Figma', 'дизайн', 3],
      ['Coda', '', ''],
    ]);
  });

  it('adds a BOM, otherwise Excel opens Cyrillic as garbled text', () => {
    const bytes = csvBytes({ headers: ['имя'], rows: [['Фигма']] });
    // TextDecoder eats the BOM itself, so we look at the raw bytes
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('имя\r\nФигма');
    expect(Array.from(csvBytes({ headers: ['a'], rows: [] }, false).slice(0, 3))).not.toEqual([
      0xef, 0xbb, 0xbf,
    ]);
  });
});

describe('round trip: export then import back', () => {
  it('returns the same values, including commas, quotes and line breaks', () => {
    const headers = ['Название', 'Заметка', 'Число'];
    const rows = [
      ['Простой', 'без спецсимволов', '1'],
      ['С запятой', 'а, б и в', '2'],
      ['С кавычкой', 'он сказал "да"', '3'],
      ['С переносом', 'первая\nвторая', '4'],
      ['Пустая заметка', '', '5'],
    ];

    const back = parseTable(toCsv({ headers, rows }));

    expect(back.headers).toEqual(headers);
    expect(back.rows).toEqual(rows);
  });

  it('does not confuse the delimiter when a tab sits inside a quoted field', () => {
    const csv = toCsv({ headers: ['a', 'b'], rows: [['есть\tтаб', 'второе']] });
    const back = parseTable(csv);
    // the whole row would land in one column if the tab were treated as the delimiter
    expect(back.headers).toEqual(['a', 'b']);
    expect(back.rows).toEqual([['есть\tтаб', 'второе']]);
  });

  it('a paste from Google Sheets and Excel still reads as TSV', () => {
    // the main import path is not a file but Ctrl+V from a spreadsheet: those use tabs
    const tsv = 'Название\tРегион\nFigma\tUS\nCoda\tEU';
    const back = parseTable(tsv);
    expect(back.headers).toEqual(['Название', 'Регион']);
    expect(back.rows).toEqual([['Figma', 'US'], ['Coda', 'EU']]);
  });

  it('survives a BOM at the start of the file', () => {
    const back = parseTable(UTF8_BOM + toCsv({ headers: ['имя'], rows: [['Фигма']] }));
    expect(back.headers).toEqual(['имя']);
  });
});

describe('filename in the header', () => {
  it('gives an ascii fallback and an encoded name for Cyrillic', () => {
    const h = attachmentHeader('Рынок AI');
    // Cyrillic replaced with underscores, the ascii part and the space preserved
    expect(h).toContain('filename="_____ AI.csv"');
    expect(h).toContain("filename*=UTF-8''%D0%A0%D1%8B%D0%BD%D0%BE%D0%BA%20AI.csv");
  });

  it('does not let a quote break the header', () => {
    expect(attachmentHeader('a"b')).toContain('filename="a_b.csv"');
  });
});
