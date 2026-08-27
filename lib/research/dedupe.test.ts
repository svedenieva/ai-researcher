import { describe, it, expect } from 'vitest';
import { planDedupe, countRemovals } from './dedupe';

describe('planDedupe', () => {
  it('groups case-insensitively and keeps the first, removing the rest', () => {
    const actions = planDedupe(
      [
        { id: '1', name: 'Runway', note: '' },
        { id: '2', name: 'runway', note: 'gen video' },
        { id: '3', name: 'Pika', note: '' },
      ],
      'name',
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].keepId).toBe('1');
    expect(actions[0].removeIds).toEqual(['2']);
    // '3' (Pika) is unique — untouched
    expect(countRemovals(actions)).toBe(1);
  });

  it('fills the kept row\'s empty cells from a duplicate (no fact lost)', () => {
    const actions = planDedupe(
      [
        { id: 'a', name: 'HeyGen', quote: '', url: 'https://heygen.com' },
        { id: 'b', name: 'HeyGen', quote: 'talking avatars', url: '' },
      ],
      'name',
    );
    expect(actions[0].keepId).toBe('a');
    expect(actions[0].patch).toEqual({ quote: 'talking avatars' }); // url already present on keep
    expect(actions[0].removeIds).toEqual(['b']);
  });

  it('does not treat empty-key rows as duplicates of each other', () => {
    const actions = planDedupe(
      [
        { id: '1', name: '' },
        { id: '2', name: '  ' },
      ],
      'name',
    );
    expect(actions).toHaveLength(0);
  });

  it('handles three-way duplicates, taking the first non-empty donor per cell', () => {
    const actions = planDedupe(
      [
        { id: '1', name: 'X', a: '', b: '' },
        { id: '2', name: 'x', a: 'from2', b: '' },
        { id: '3', name: 'X', a: 'from3', b: 'b3' },
      ],
      'name',
    );
    expect(actions[0].keepId).toBe('1');
    expect(actions[0].patch).toEqual({ a: 'from2', b: 'b3' });
    expect(actions[0].removeIds).toEqual(['2', '3']);
    expect(countRemovals(actions)).toBe(2);
  });
});
