import { describe, it, expect } from 'vitest';
import { checkAll, checkUrl, extractUrls, isFetchableUrl, summarize } from './links';

describe('extractUrls', () => {
  it('finds several links in one free-text cell', () => {
    const cell = 'см. https://a.example/page и https://b.example/x?y=1';
    expect(extractUrls(cell)).toEqual(['https://a.example/page', 'https://b.example/x?y=1']);
  });

  it('drops punctuation that clings to a link inside prose', () => {
    expect(extractUrls('источник: https://a.example/page.')).toEqual(['https://a.example/page']);
  });

  it('returns nothing for empty cells and plain text', () => {
    expect(extractUrls(null)).toEqual([]);
    expect(extractUrls('просто текст')).toEqual([]);
  });
});

// The server makes these requests, so a "source" pasted by anyone must not be
// able to aim it at the private network or the cloud metadata endpoint.
describe('isFetchableUrl', () => {
  it('accepts ordinary public links', () => {
    expect(isFetchableUrl('https://example.com/a')).toBe(true);
    expect(isFetchableUrl('http://example.com')).toBe(true);
  });

  it('refuses non-http protocols', () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(isFetchableUrl(u)).toBe(false);
    }
  });

  it('refuses the private network and the metadata endpoint', () => {
    for (const host of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://10.0.0.5/x',
      'http://192.168.1.1/x',
      'http://172.16.0.1/x',
      'http://169.254.169.254/latest/meta-data/',
      'http://db.internal/x',
      'http://printer.local/x',
    ]) {
      expect(isFetchableUrl(host)).toBe(false);
    }
  });
});

describe('checkUrl', () => {
  const res = (status: number) => ({ ok: status >= 200 && status < 400, status }) as Response;

  it('calls a blocked address dead without ever fetching it', async () => {
    let called = false;
    const spy = (async () => { called = true; return res(200); }) as unknown as typeof fetch;
    expect(await checkUrl('http://169.254.169.254/', 10, spy)).toEqual({ url: 'http://169.254.169.254/', verdict: 'blocked' });
    expect(called).toBe(false);
  });

  it('marks a 404 dead and a 200 ok', async () => {
    const ok = (async () => res(200)) as unknown as typeof fetch;
    const gone = (async () => res(404)) as unknown as typeof fetch;
    expect((await checkUrl('https://a.example', 10, ok)).verdict).toBe('ok');
    expect((await checkUrl('https://a.example', 10, gone)).verdict).toBe('dead');
  });

  it('retries with GET when the server refuses HEAD', async () => {
    const methods: string[] = [];
    const impl = (async (_u: string, init: RequestInit) => {
      methods.push(String(init.method));
      return res(init.method === 'HEAD' ? 405 : 200);
    }) as unknown as typeof fetch;
    expect((await checkUrl('https://a.example', 10, impl)).verdict).toBe('ok');
    expect(methods).toEqual(['HEAD', 'GET']);
  });

  it('treats a network failure as dead rather than throwing', async () => {
    const boom = (async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch;
    expect((await checkUrl('https://a.example', 10, boom)).verdict).toBe('dead');
  });
});

describe('summarize', () => {
  it('is explicit about what it checked', () => {
    expect(summarize([])).toBe('нет ссылок');
    expect(summarize([{ url: 'u', verdict: 'ok' }])).toBe('источник открылся');
    expect(summarize([{ url: 'u', verdict: 'dead' }, { url: 'v', verdict: 'ok' }])).toBe('битых: 1 из 2');
  });

  // it must never claim the row is true — only that the link resolved
  it('never says the row is correct', () => {
    const text = summarize([{ url: 'u', verdict: 'ok' }]);
    expect(text).not.toMatch(/верно|достоверн|подтвержд/i);
  });
});

describe('checkAll', () => {
  it('checks each distinct url once', async () => {
    const seen: string[] = [];
    const fake = async (url: string) => { seen.push(url); return { url, verdict: 'ok' as const }; };
    const out = await checkAll(['https://a.example', 'https://a.example', 'https://b.example'], 2, fake);
    expect(seen.sort()).toEqual(['https://a.example', 'https://b.example']);
    expect(out.size).toBe(2);
  });
});
