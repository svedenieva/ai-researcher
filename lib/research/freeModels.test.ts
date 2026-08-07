import { describe, it, expect } from 'vitest';
import { pickFree } from './freeModels';

describe('pickFree', () => {
  it('keeps only models whose prompt and completion price are 0', () => {
    const models = [
      { id: 'a/free-1', pricing: { prompt: '0', completion: '0' } },
      { id: 'b/paid', pricing: { prompt: '0.000003', completion: '0.000015' } },
      { id: 'c/free-2:free', pricing: { prompt: '0', completion: '0' } },
      { id: 'd/half', pricing: { prompt: '0', completion: '0.00001' } },
    ];
    expect(pickFree(models).sort()).toEqual(['a/free-1', 'c/free-2:free']);
  });
  it('ignores entries without pricing or id', () => {
    expect(pickFree([{ id: 'x' } as never, { pricing: { prompt: '0', completion: '0' } } as never])).toEqual([]);
  });
  it('excludes models with empty-string pricing (not a valid zero)', () => {
    expect(pickFree([{ id: 'e/empty', pricing: { prompt: '', completion: '' } }])).toEqual([]);
  });
});
