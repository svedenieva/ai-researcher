import { describe, it, expect } from 'vitest';
import { findTopicBase } from './topic-guard';

const base = (o: Partial<{ id: string; name: string; state: string; query: string }>) =>
  ({ id: 'b', name: '', state: null, query: null, ...o }) as never;

describe('findTopicBase', () => {
  const bases = [
    base({ id: 'a', name: 'AI video tools', state: 'closed', query: 'инструменты для видео на ИИ' }),
    base({ id: 'b', name: 'Coding assistants', state: 'in_progress' }),
  ];

  it('matches a closed topic by formulation (query)', () => {
    expect(findTopicBase(bases, '  Инструменты для видео на ИИ ')).toEqual({ id: 'a', name: 'AI video tools', closed: true });
  });

  it('matches by base name too', () => {
    expect(findTopicBase(bases, 'coding assistants')).toEqual({ id: 'b', name: 'Coding assistants', closed: false });
  });

  it('no match → null', () => {
    expect(findTopicBase(bases, 'quantum computing')).toBeNull();
    expect(findTopicBase(bases, '')).toBeNull();
  });
});
