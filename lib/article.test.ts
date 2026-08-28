import { describe, it, expect } from 'vitest';
import type { ColumnDef } from './datasource/types';
import { buildArticle } from './article';
import { MODE_KEY, MODE_REFERENCE, MODE_RESEARCH } from './mode';
import { TAGS_KEY, TAGS_COLUMN } from './tags';

const columns: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text' },
  { key: 'инструкции', label: 'Инструкции', type: 'long-text' },
  { key: 'описание', label: 'Описание', type: 'long-text' },
  { key: 'чеклист', label: 'Чек-лист', type: 'long-text' },
  { key: 'заметки', label: 'Заметки', type: 'long-text' },
  { key: 'источники', label: 'Источники', type: 'long-text' },
  { key: 'цитата', label: 'Цитата', type: 'long-text' },
  { key: 'сайт', label: 'Сайт', type: 'url' },
  { key: 'стадия', label: 'Стадия', type: 'select' },
];

const record = {
  id: 'r1',
  'название': 'Тема X',
  'инструкции': 'сделай это',
  'описание': 'что и почему',
  'чеклист': '- пункт a\n- пункт b',
  'заметки': 'прочее',
  'источники': 'см. https://a.example/page',
  'цитата': 'дословная цитата',
  'сайт': 'https://x.example',
  'стадия': 'Изучение',
  [MODE_KEY]: MODE_REFERENCE,
};

describe('buildArticle — field → section mapping (§4.5, §5.5)', () => {
  const a = buildArticle(columns, record);

  it('takes the first column as the title', () => {
    expect(a.title).toBe('Тема X');
  });

  it('orders the §4.5 triad first: Описание → Инструкции → Чек-лист, then other long-text', () => {
    expect(a.sections.map((s) => s.heading)).toEqual(['Описание', 'Инструкции', 'Чек-лист', 'Заметки']);
  });

  it('renders the checklist section as a checklist, prose as markdown', () => {
    const byHeading = Object.fromEntries(a.sections.map((s) => [s.heading, s.kind]));
    expect(byHeading['Чек-лист']).toBe('checklist');
    expect(byHeading['Описание']).toBe('markdown');
    expect(byHeading['Заметки']).toBe('markdown');
  });

  it('routes sources, quotes, url and select into the side pop-out / badges, NOT the main sections', () => {
    // sources/quotes never become article sections
    expect(a.sections.map((s) => s.heading)).not.toContain('Источники');
    expect(a.sections.map((s) => s.heading)).not.toContain('Цитата');
    expect(a.sidebar.sources).toEqual(['https://a.example/page']);
    expect(a.sidebar.quotes).toEqual(['дословная цитата']);
    expect(a.sidebar.links).toEqual([{ label: 'Сайт', url: 'https://x.example' }]);
    expect(a.badges).toEqual([{ column: 'стадия', label: 'Стадия', value: 'Изучение' }]);
  });

  it('reads the reference mode from the record', () => {
    expect(a.mode).toBe('reference');
    expect(buildArticle(columns, { ...record, [MODE_KEY]: MODE_RESEARCH }).mode).toBe('draft');
    expect(buildArticle(columns, { ...record, [MODE_KEY]: undefined }).mode).toBe('draft'); // absent → draft
  });

  it('splits a checklist section into items', () => {
    const cl = a.sections.find((s) => s.heading === 'Чек-лист')!;
    expect(cl.items).toEqual(['пункт a', 'пункт b']);
  });

  it('turns the system «Теги» column (__tags) into wiki-style badges', () => {
    const withTags = buildArticle([...columns, TAGS_COLUMN], { ...record, [TAGS_KEY]: 'важное, обзор' });
    expect(withTags.badges).toEqual([
      { column: 'стадия', label: 'Стадия', value: 'Изучение' },
      { column: TAGS_KEY, label: TAGS_COLUMN.label, value: 'важное' },
      { column: TAGS_KEY, label: TAGS_COLUMN.label, value: 'обзор' },
    ]);
  });
});
