import { describe, it, expect } from 'vitest';
import { composeSections, sectionsMarkdown, EMPTY_MARK } from './result-sections';

const columns = [
  { key: 'название', label: 'Название' },
  { key: 'платформа', label: 'Платформа', type: 'select' as const },
  { key: 'цитата', label: 'Цитата' },
  { key: 'источники', label: 'Источники' },
  { key: 'вывод', label: 'Вывод' },
];

const rows = [
  { id: '1', название: 'HeyGen', платформа: 'YouTube', цитата: 'best avatar tool', источники: 'https://a.com', вывод: 'лидер рынка' },
  { id: '2', название: 'Synthesia', платформа: 'Официальный сайт', цитата: 'enterprise video', источники: 'https://b.com' },
];

describe('composeSections', () => {
  it('always returns all seven sections in order', () => {
    const titles = composeSections(columns, rows).map((s) => s.title);
    expect(titles).toEqual([
      'Выводы',
      'Первоисточники',
      'Части исследования',
      'Альтернативные точки зрения',
      'Особое мнение',
      'Таблица «цитата — источник»',
      'Оценка по тезисам',
    ]);
  });

  it('fills derivable sections, marks the rest empty', () => {
    const s = Object.fromEntries(composeSections(columns, rows).map((x) => [x.title, x]));
    expect(s['Первоисточники'].filled).toBe(true);
    expect(s['Первоисточники'].body).toContain('https://a.com');
    expect(s['Части исследования'].filled).toBe(true); // grouped by платформа
    expect(s['Таблица «цитата — источник»'].filled).toBe(true);
    expect(s['Выводы'].filled).toBe(true); // «Вывод» column present
    expect(s['Особое мнение'].filled).toBe(false); // no such column
    expect(s['Оценка по тезисам'].filled).toBe(false);
  });

  it('markdown marks empty sections', () => {
    const md = sectionsMarkdown(composeSections(columns, rows));
    expect(md).toContain('## Особое мнение');
    expect(md).toContain(EMPTY_MARK);
    expect(md).toContain('## Таблица «цитата — источник»');
  });
});
