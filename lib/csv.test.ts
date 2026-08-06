import { describe, it, expect } from 'vitest';
import { attachmentHeader, csvField, rowsFor, toCsv, UTF8_BOM, csvBytes } from './csv';
import { parseTable } from './parseTable';

// Проверяем ровно те семь правил RFC 4180, которые выписаны в исследовании.
describe('RFC 4180 — сериализация', () => {
  it('правило 1: записи разделяются CRLF', () => {
    const csv = toCsv({ headers: ['a', 'b'], rows: [['1', '2'], ['3', '4']] });
    expect(csv).toBe('a,b\r\n1,2\r\n3,4');
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('правило 2: завершающего перевода строки нет', () => {
    expect(toCsv({ headers: ['a'], rows: [['1']] }).endsWith('\r\n')).toBe(false);
  });

  it('правило 3: заголовки идут первой строкой в том же формате', () => {
    const csv = toCsv({ headers: ['имя, полное', 'b'], rows: [['x', 'y']] });
    expect(csv.split('\r\n')[0]).toBe('"имя, полное",b');
  });

  it('правило 4: поля разделяются запятыми', () => {
    expect(toCsv({ headers: ['a', 'b', 'c'], rows: [] })).toBe('a,b,c');
  });

  it('правило 5: без спецсимволов кавычки не ставятся', () => {
    expect(csvField('простой текст')).toBe('простой текст');
    expect(csvField(42)).toBe('42');
  });

  it('правило 6: запятая, кавычка и перевод строки требуют кавычек', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('стро\r\nка')).toBe('"стро\r\nка"');
    expect(csvField('одна\nстрока')).toBe('"одна\nстрока"');
    expect(csvField('он сказал "да"')).toBe('"он сказал ""да"""');
  });

  it('правило 7: кавычка внутри поля удваивается', () => {
    expect(csvField('"')).toBe('""""');
    expect(csvField('a"b"c')).toBe('"a""b""c"');
  });

  it('пустые и отсутствующие значения дают пустое поле', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField('')).toBe('');
  });
});

describe('выгрузка таблицы', () => {
  const columns = [{ key: 'name' }, { key: 'note' }, { key: 'pop' }];

  it('раскладывает записи по порядку колонок, пропуски — пустыми', () => {
    const rows = rowsFor(columns, [
      { name: 'Figma', note: 'дизайн', pop: 3 },
      { name: 'Coda' },
    ]);
    expect(rows).toEqual([
      ['Figma', 'дизайн', 3],
      ['Coda', '', ''],
    ]);
  });

  it('добавляет BOM, иначе Excel открывает кириллицу кракозябрами', () => {
    const bytes = csvBytes({ headers: ['имя'], rows: [['Фигма']] });
    // TextDecoder сам съедает BOM, поэтому смотрим на сырые байты
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('имя\r\nФигма');
    expect(Array.from(csvBytes({ headers: ['a'], rows: [] }, false).slice(0, 3))).not.toEqual([
      0xef, 0xbb, 0xbf,
    ]);
  });
});

describe('круг: выгрузили — загрузили обратно', () => {
  it('возвращает те же значения, включая запятые, кавычки и переносы', () => {
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

  it('не путает разделитель, когда таб лежит внутри поля в кавычках', () => {
    const csv = toCsv({ headers: ['a', 'b'], rows: [['есть\tтаб', 'второе']] });
    const back = parseTable(csv);
    // строка целиком уехала бы в одну колонку, если бы разделителем сочли таб
    expect(back.headers).toEqual(['a', 'b']);
    expect(back.rows).toEqual([['есть\tтаб', 'второе']]);
  });

  it('вставка из Google Sheets и Excel по-прежнему читается как TSV', () => {
    // главный путь импорта — не файл, а Ctrl+V из таблицы: там табы
    const tsv = 'Название\tРегион\nFigma\tUS\nCoda\tEU';
    const back = parseTable(tsv);
    expect(back.headers).toEqual(['Название', 'Регион']);
    expect(back.rows).toEqual([['Figma', 'US'], ['Coda', 'EU']]);
  });

  it('переживает BOM в начале файла', () => {
    const back = parseTable(UTF8_BOM + toCsv({ headers: ['имя'], rows: [['Фигма']] }));
    expect(back.headers).toEqual(['имя']);
  });
});

describe('имя файла в заголовке', () => {
  it('даёт ascii-запаску и кодированное имя для кириллицы', () => {
    const h = attachmentHeader('Рынок AI');
    // кириллица заменена подчёркиваниями, ascii-часть и пробел сохранены
    expect(h).toContain('filename="_____ AI.csv"');
    expect(h).toContain("filename*=UTF-8''%D0%A0%D1%8B%D0%BD%D0%BE%D0%BA%20AI.csv");
  });

  it('не даёт кавычке разорвать заголовок', () => {
    expect(attachmentHeader('a"b')).toContain('filename="a_b.csv"');
  });
});
