import { describe, it, expect } from 'vitest';
import { planTagNormalization, canonKey } from './normalize-tags';
import { TAGS_KEY } from '../tags';

const row = (id: string, tags: string) => ({ id, [TAGS_KEY]: tags });

describe('canonKey', () => {
  it('collapses case, spaces, punctuation', () => {
    expect(canonKey('AI')).toBe('ai');
    expect(canonKey('a.i.')).toBe('ai');
    expect(canonKey(' A I ')).toBe('a i');
    expect(canonKey('Machine-Learning')).toBe('machine learning');
  });
});

describe('planTagNormalization', () => {
  it('rewrites variant spellings to the most frequent one', () => {
    const rows = [
      row('1', 'AI, video'),
      row('2', 'ai'),
      row('3', 'Ai, Video'),
      row('4', 'ai'), // "ai" is now most frequent (3×) over "AI"/"Ai"
    ];
    const fixes = planTagNormalization(rows);
    const byId = Object.fromEntries(fixes.map((f) => [f.id, f.tags]));
    expect(byId['1']).toBe('ai, video'); // AI→ai, video stays (only spelling)
    expect(byId['3']).toBe('ai, video'); // Ai→ai, Video→video
    expect('2' in byId).toBe(false); // already canonical
    expect('4' in byId).toBe(false);
  });

  it('drops duplicate tags created by the merge', () => {
    const fixes = planTagNormalization([row('1', 'AI, a.i., video')]);
    expect(fixes[0].tags).toBe('AI, video'); // a.i. collapses into AI, deduped
  });

  it('no tags → no fixes', () => {
    expect(planTagNormalization([row('1', ''), { id: '2' }])).toEqual([]);
  });
});
