import { describe, it, expect } from 'vitest';
import { BASE_PRESETS, implementationPreset, defaultGroupSort } from './presets';

describe('implementation preset «Внедрение»', () => {
  const preset = implementationPreset();

  it('is registered and named «Внедрение»', () => {
    expect(BASE_PRESETS.some((p) => p.id === preset.id)).toBe(true);
    expect(preset.name).toBe('Внедрение');
  });

  it('has the six process columns in order, name column first', () => {
    expect(preset.columns.map((c) => c.label)).toEqual([
      'Ноу-хау', 'Стадия', 'Ответственный', 'Инструкция', 'Дата', 'Заметки',
    ]);
    expect(preset.columns[0].type).toBe('text'); // «Ноу-хау» primary
  });

  it('«Стадия» is a select with exactly the five stages in the right order', () => {
    const stage = preset.columns.find((c) => c.label === 'Стадия')!;
    expect(stage.type).toBe('select');
    expect(stage.order).toEqual([
      'Изучение', 'Внедрение', 'Написание инструкции', 'Обучение', 'Проверка применения',
    ]);
  });

  it('each stage carries a colour badge and it is the default grouping', () => {
    const stage = preset.columns.find((c) => c.label === 'Стадия')!;
    expect(stage.badge).toBe(true);
    expect(stage.filterable).toBe(true);
    // one colour per stage, all five mapped
    expect(Object.keys(stage.badgeVariant ?? {}).sort()).toEqual([...(stage.order ?? [])].sort());
    expect(stage.defaultGroup).toBe(true);
  });

  it('the other columns have the expected types', () => {
    const byLabel = Object.fromEntries(preset.columns.map((c) => [c.label, c.type]));
    expect(byLabel['Инструкция']).toBe('url');
    expect(byLabel['Дата']).toBe('date');
    expect(byLabel['Заметки']).toBe('long-text');
  });
});

describe('defaultGroupSort', () => {
  it('groups (asc) by the first column flagged defaultGroup', () => {
    expect(defaultGroupSort([{ key: 'name' }, { key: 'стадия', defaultGroup: true }])).toEqual({
      key: 'стадия',
      dir: 'asc',
    });
  });
  it('returns undefined when no column asks for it', () => {
    expect(defaultGroupSort([{ key: 'name' }])).toBeUndefined();
  });
});
