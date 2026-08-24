import { describe, it, expect } from 'vitest';
import { matchSources, normalizeType, type TrustedSource } from './sources';

const src = (name: string, topics: string[]): TrustedSource => ({
  id: name,
  name,
  type: 'expert',
  url: `https://x.com/${name}`,
  topics,
});

describe('matchSources', () => {
  const all = [
    src('Karpathy', ['ai', 'ml', 'agents']),
    src('HBR', ['business', 'management']),
    src('Untagged', []),
  ];

  it('returns sources whose topic tag appears in the question', () => {
    const got = matchSources(all, 'лучшие AI-агенты для продаж').map((s) => s.name);
    expect(got).toContain('Karpathy'); // "agents" tag ⊂ "агенты"? no — matches on "ai"
    expect(got).not.toContain('HBR');
  });

  it('matches when the question word contains the tag or vice versa', () => {
    // tag "ai" is contained in the word "ai-агенты" once split → "ai"
    const got = matchSources(all, 'AI research').map((s) => s.name);
    expect(got).toContain('Karpathy');
  });

  it('always includes untagged sources — a thin registry stays useful', () => {
    const got = matchSources(all, 'business strategy').map((s) => s.name);
    expect(got).toContain('HBR');
    expect(got).toContain('Untagged');
    expect(got).not.toContain('Karpathy');
  });

  it('returns everything when the query has no comparable words', () => {
    expect(matchSources(all, '   ').length).toBe(all.length);
  });
});

describe('normalizeType', () => {
  it('accepts the three known types', () => {
    expect(normalizeType('platform')).toBe('platform');
    expect(normalizeType('channel')).toBe('channel');
    expect(normalizeType('expert')).toBe('expert');
  });
  it('falls back to platform for anything else', () => {
    expect(normalizeType('nonsense')).toBe('platform');
    expect(normalizeType(undefined)).toBe('platform');
  });
});
