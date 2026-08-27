import { describe, it, expect } from 'vitest';
import { quoteFoundOnPage } from './verify-quote';

describe('quoteFoundOnPage', () => {
  const page = (html: string): typeof fetch =>
    (async () => ({ ok: true, text: async () => html })) as unknown as typeof fetch;

  it('true when the quote is present on the page (whitespace/markup tolerant)', async () => {
    const f = page('<html><body><p>Create   AI  videos in minutes, no crew.</p></body></html>');
    expect(await quoteFoundOnPage('https://x.com', 'Create AI videos in minutes', f)).toBe(true);
  });

  it('false when the quote is not on the page', async () => {
    const f = page('<html><body>Something entirely different</body></html>');
    expect(await quoteFoundOnPage('https://x.com', 'Create AI videos in minutes', f)).toBe(false);
  });

  it('false on a failed fetch or a missing url/quote', async () => {
    const bad = (async () => ({ ok: false, text: async () => '' })) as unknown as typeof fetch;
    expect(await quoteFoundOnPage('https://x.com', 'Create AI videos in minutes', bad)).toBe(false);
    expect(await quoteFoundOnPage('', 'a real quote here', page('...'))).toBe(false);
    expect(await quoteFoundOnPage('https://x.com', 'short', page('short'))).toBe(false);
  });
});
