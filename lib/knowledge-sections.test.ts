import { describe, it, expect } from 'vitest';
import { knowledgeSections } from './article';
import type { ColumnDef } from './datasource/types';

const cols: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text' },
  { key: 'intro', label: 'Введение', type: 'long-text' },
  { key: 'setup', label: 'Настройка', type: 'long-text' },
  { key: 'setupCheck', label: 'Чек-лист настройки', type: 'long-text' },
];

describe('knowledgeSections (ТР-БЗ-03)', () => {
  it('always returns the three sections in order', () => {
    const s = knowledgeSections(cols, { id: '1' });
    expect(s.map((x) => x.heading)).toEqual(['Введение', 'Настройка', 'Использование']);
  });

  it('fills matching columns, marks the rest empty', () => {
    const rec = { id: '1', intro: 'что это такое', setup: 'подключите ключ', setupCheck: '- шаг 1\n- шаг 2' };
    const s = Object.fromEntries(knowledgeSections(cols, rec).map((x) => [x.heading, x]));
    expect(s['Введение'].filled).toBe(true);
    expect(s['Введение'].description).toBe('что это такое');
    expect(s['Настройка'].filled).toBe(true);
    expect(s['Настройка'].items).toEqual(['шаг 1', 'шаг 2']); // «Чек-лист настройки» → items
    expect(s['Настройка'].description).toBe('подключите ключ');
    expect(s['Использование'].filled).toBe(false); // no matching column
    expect(s['Использование'].items).toEqual([]);
  });
});
