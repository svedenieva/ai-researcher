import { describe, it, expect, afterEach } from 'vitest';
import { parseTokens, emailForToken, tokenForEmail } from './tokens';

const original = process.env.MCP_TOKENS;
afterEach(() => {
  if (original === undefined) delete process.env.MCP_TOKENS;
  else process.env.MCP_TOKENS = original;
});

function withTokens(raw: string) {
  process.env.MCP_TOKENS = raw;
}

describe('parseTokens', () => {
  it('reads token:email pairs and tolerates spacing', () => {
    expect(parseTokens('a1:alice@x.com, b2 : bob@x.com')).toEqual([
      { token: 'a1', email: 'alice@x.com' },
      { token: 'b2', email: 'bob@x.com' },
    ]);
  });

  it('skips malformed and empty entries instead of inventing them', () => {
    expect(parseTokens('nocolon,:noemail,tok:,,x:y')).toEqual([{ token: 'x', email: 'y' }]);
  });

  it('is empty when the variable is unset', () => {
    expect(parseTokens('')).toEqual([]);
  });
});

describe('emailForToken', () => {
  it('maps a known token to its owner', () => {
    withTokens('a1:alice@x.com,b2:bob@x.com');
    expect(emailForToken('b2')).toBe('bob@x.com');
  });

  it('rejects an unknown or empty token', () => {
    withTokens('a1:alice@x.com');
    expect(emailForToken('nope')).toBeNull();
    expect(emailForToken(null)).toBeNull();
  });

  // tokens are secrets: a prefix must never be good enough
  it('does not match on a partial token', () => {
    withTokens('supersecret:alice@x.com');
    expect(emailForToken('super')).toBeNull();
    expect(emailForToken('supersecretly')).toBeNull();
  });
});

describe('tokenForEmail', () => {
  it('returns the person their own token, ignoring case', () => {
    withTokens('a1:Alice@X.com,b2:bob@x.com');
    expect(tokenForEmail('alice@x.com')).toBe('a1');
  });

  // the whole point of the connect page: it must never hand out someone else's
  it('gives nothing for an address that has no token', () => {
    withTokens('a1:alice@x.com');
    expect(tokenForEmail('carol@x.com')).toBeNull();
    expect(tokenForEmail(null)).toBeNull();
    expect(tokenForEmail('')).toBeNull();
  });
});
