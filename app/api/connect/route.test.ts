import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

// currentEmail() falls back to 'local@dev' when Supabase auth isn't configured,
// which is exactly the shape we want here: a known caller, no cookie plumbing.
const ME = 'local@dev';
const env = { tokens: process.env.MCP_TOKENS, url: process.env.NEXT_PUBLIC_SUPABASE_URL };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => {
  if (env.tokens === undefined) delete process.env.MCP_TOKENS;
  else process.env.MCP_TOKENS = env.tokens;
  if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
});

const call = () => GET(new Request('https://example.test/api/connect'));

describe('GET /api/connect', () => {
  it('hands the caller their own token and the endpoint', async () => {
    process.env.MCP_TOKENS = `mine:${ME},theirs:someone@else.com`;
    const body = await (await call()).json();
    expect(body.email).toBe(ME);
    expect(body.token).toBe('mine');
    expect(body.endpoint).toBe('https://example.test/api/mcp');
  });

  // the reason this route is narrow: it must never become a token listing
  it('never leaks anyone else\'s token', async () => {
    process.env.MCP_TOKENS = `theirs:someone@else.com,other:third@x.com`;
    const res = await call();
    const body = await res.json();
    expect(body.token).toBeNull();
    expect(JSON.stringify(body)).not.toContain('theirs');
    expect(JSON.stringify(body)).not.toContain('other');
  });

  it('is not cacheable — the payload is a credential', async () => {
    process.env.MCP_TOKENS = `mine:${ME}`;
    const res = await call();
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
});
