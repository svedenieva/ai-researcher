import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/current-user', () => ({ currentEmail: async () => 'alice@example.com' }));

import { GET as searchGET } from '@/app/api/search/route';
import { getCustomStore } from '@/lib/datasource/customStore';

const ALICE = 'alice@example.com';
const search = (q: string) => searchGET(new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`));

interface Hit { baseId: string; baseName: string; rowId?: string; label: string; kind: 'base' | 'row' }

describe('/api/search — global search across the user\'s bases', () => {
  it('finds a matching row and reports which base it is in', async () => {
    const store = getCustomStore();
    const base = await store.createBase({
      name: 'Ринок AI', columns: [{ key: 'name', label: 'Назва', type: 'text' }], owner: ALICE,
    });
    await store.addRecord(base.id, { name: 'Synthesia' });

    const { results } = (await (await search('synthes')).json()) as { results: Hit[] };
    const hit = results.find((r) => r.kind === 'row' && r.label === 'Synthesia');
    expect(hit).toBeTruthy();
    expect(hit!.baseName).toBe('Ринок AI');
    expect(hit!.baseId).toBe(base.id);
  });

  it('matches base names, not only rows', async () => {
    const store = getCustomStore();
    await store.createBase({ name: 'База xyzzy', columns: [{ key: 'n', label: 'N', type: 'text' }], owner: ALICE });
    const { results } = (await (await search('xyzzy')).json()) as { results: Hit[] };
    expect(results.some((r) => r.kind === 'base' && r.baseName.toLowerCase().includes('xyzzy'))).toBe(true);
  });

  it('a one-character query returns nothing (no full scans on a keystroke)', async () => {
    const { results } = (await (await search('a')).json()) as { results: Hit[] };
    expect(results).toEqual([]);
  });
});
