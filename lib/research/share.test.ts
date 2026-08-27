import { describe, it, expect } from 'vitest';
import { sharingEnabled, shareToken, verifyShareToken } from './share';

const on = { RESEARCH_SHARE_SECRET: 'test-secret' };

describe('research share tokens', () => {
  it('is disabled without a secret; enabled with one', () => {
    expect(sharingEnabled({})).toBe(false);
    expect(sharingEnabled(on)).toBe(true);
    expect(shareToken('base-1', {})).toBe('');
  });

  it('a token verifies for its own base and not for another', () => {
    const t = shareToken('base-1', on);
    expect(t.length).toBe(24);
    expect(verifyShareToken('base-1', t, on)).toBe(true);
    expect(verifyShareToken('base-2', t, on)).toBe(false);
  });

  it('rejects an empty, wrong, or wrong-length token', () => {
    const t = shareToken('base-1', on);
    expect(verifyShareToken('base-1', '', on)).toBe(false);
    expect(verifyShareToken('base-1', 'x'.repeat(24), on)).toBe(false);
    expect(verifyShareToken('base-1', t.slice(0, 10), on)).toBe(false);
  });

  it('a token from one secret does not verify under another', () => {
    const t = shareToken('base-1', on);
    expect(verifyShareToken('base-1', t, { RESEARCH_SHARE_SECRET: 'other' })).toBe(false);
  });
});
