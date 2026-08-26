import { describe, it, expect, vi } from 'vitest';

// We stub the store: the route is tested for routing and headers, not against a
// live Supabase.
vi.mock('@/lib/sites/store', () => {
  const files: Record<string, string> = {
    'index.html': '<link rel="stylesheet" href="style.css"><h1>Привет</h1>',
    'style.css': 'body{margin:0}',
    'assets/logo.svg': '<svg/>',
  };
  return {
    SitesNotSetUp: class SitesNotSetUp extends Error {},
    getSiteStore: () => ({
      get: async (id: string) =>
        id === 'demo'
          ? { id: 'demo', name: 'Демо', entry: 'index.html', tags: [], fileCount: 3, sizeBytes: 60 }
          : null,
      readFile: async (_id: string, path: string) =>
        files[path] ? new TextEncoder().encode(files[path]) : null,
    }),
  };
});

import { GET } from './route';

function call(url: string, id: string, path?: string[]) {
  return GET(new Request(url), { params: Promise.resolve({ id, path }) });
}

describe('GET /s/[id]/[[...path]]', () => {
  it('sends a bare /s/<id> to the entry page', async () => {
    const res = await call('http://localhost/s/demo', 'demo');
    expect(res.status).toBe(307);
    // without this redirect, a relative style.css inside the HTML would resolve
    // to /s/style.css — a level above the site itself
    expect(res.headers.get('location')).toBe('http://localhost/s/demo/index.html');
  });

  it('serves a nested asset with the type from its extension', async () => {
    const res = await call('http://localhost/s/demo/assets/logo.svg', 'demo', ['assets', 'logo.svg']);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe('<svg/>');
  });

  it('serves html as html', async () => {
    const res = await call('http://localhost/s/demo/index.html', 'demo', ['index.html']);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('Привет');
  });

  it('explains a missing file instead of failing blankly', async () => {
    const res = await call('http://localhost/s/demo/nope.css', 'demo', ['nope.css']);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain('nope.css');
    expect(text).toContain('Демо');
  });

  it('404s an unknown site', async () => {
    const res = await call('http://localhost/s/ghost', 'ghost');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('ghost');
  });

  it('refuses to climb out of the site folder', async () => {
    const res = await call('http://localhost/s/demo/../../etc', 'demo', ['..', '..', 'etc']);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('Неприпустимий шлях');
  });
});
