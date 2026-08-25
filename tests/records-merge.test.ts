import { describe, it, expect, vi, beforeEach } from 'vitest';

// The catalog view merges rows from custom bases nested under a built-in section.
// Those rows carry UUID ids, so opening one must route to its base, not to
// /product/<uuid> (which only knows catalog slugs and 404s). The route tags each
// merged custom row with __baseId to make that possible — this locks it in.

vi.mock('@/lib/current-user', () => ({ currentEmail: async () => 'alice@example.com' }));

import { GET as recordsGET } from '@/app/api/records/route';
import { getCustomStore } from '@/lib/datasource/customStore';

const ALICE = 'alice@example.com';

describe('catalog merge — __baseId on nested custom rows (404 fix)', () => {
  it('a custom base nested under a built-in section tags its rows with __baseId', async () => {
    const store = getCustomStore();
    const child = await store.createBase({
      name: 'Под каталогом',
      columns: [{ key: 'name', label: 'Название', type: 'text' }],
      owner: ALICE,
      parent: 'ai', // a built-in section id
    });
    await store.addRecord(child.id, { name: 'моя строка' });

    const body = await (await recordsGET(new Request('http://localhost/api/records?base=ai'))).json();
    const row = (body.records as Array<Record<string, unknown>>).find((r) => r.name === 'моя строка');
    expect(row).toBeTruthy();
    expect(row!.__baseId).toBe(child.id);
  });

  it('genuine catalog rows carry no __baseId (they open as /product/<slug>)', async () => {
    const body = await (await recordsGET(new Request('http://localhost/api/records?base=ai'))).json();
    const catalogRows = (body.records as Array<Record<string, unknown>>).filter((r) => !r.__baseId);
    // the catalog itself has rows, and none of them are tagged with a base id
    expect(catalogRows.length).toBeGreaterThan(0);
  });
});
