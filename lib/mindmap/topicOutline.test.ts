import { describe, it, expect } from 'vitest';
import type { ColumnDef } from '@/lib/datasource/types';
import { buildArticle } from '@/lib/article';
import { articleToOutline } from './topicOutline';

const columns: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text' },
  { key: 'описание', label: 'Описание', type: 'long-text' },
  { key: 'чеклист', label: 'Чек-лист', type: 'long-text' },
  { key: 'источники', label: 'Источники', type: 'long-text' },
  { key: 'стадия', label: 'Стадия', type: 'select' },
];
const record = {
  id: 'r1',
  'название': 'Тема X',
  'описание': 'что и почему',
  'чеклист': '- пункт a\n- пункт b',
  'источники': 'https://a.example/page',
  'стадия': 'Изучение',
};

describe('articleToOutline — topic → mind-map tree', () => {
  const outline = articleToOutline(buildArticle(columns, record));

  it('has a single root named after the topic', () => {
    expect(outline).toHaveLength(1);
    expect(outline[0].name).toBe('Тема X');
  });

  it('branches per section, with checklist items as leaves', () => {
    const kids = (outline[0].children ?? []).map((c) => c.name);
    expect(kids).toContain('Описание');
    expect(kids).toContain('Чек-лист');
    const checklist = outline[0].children!.find((c) => c.name === 'Чек-лист')!;
    expect((checklist.children ?? []).map((c) => c.name)).toEqual(['пункт a', 'пункт b']);
  });

  it('adds tags and sources as their own branches', () => {
    const kids = outline[0].children ?? [];
    const marks = kids.find((c) => c.name === 'Метки');
    const sources = kids.find((c) => c.name === 'Источники');
    expect(marks?.children?.[0].name).toBe('Изучение');
    expect(sources?.children?.[0].name).toBe('https://a.example/page');
  });
});
