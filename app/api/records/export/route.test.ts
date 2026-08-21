import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { getCustomStore } from '@/lib/datasource/customStore';
import { MODE_KEY, MODE_REFERENCE } from '@/lib/mode';

// The export promises "what's on screen is what's in the file". The mode switch
// narrows the screen, so it has to narrow the file — this used to leak every row
// because the download link dropped the mode parameter on the way out.
describe('GET /api/records/export', () => {
  async function seedBase() {
    const store = getCustomStore();
    const base = await store.createBase({
      name: 'ExportMode',
      columns: [{ key: 'name', label: 'Название', type: 'text' }],
    });
    await store.addRecord(base.id, { name: 'черновик' });
    await store.addRecord(base.id, { name: 'проверено', [MODE_KEY]: MODE_REFERENCE });
    return base;
  }

  it('exports the whole base when no mode is given', async () => {
    const base = await seedBase();
    const csv = await (await GET(new Request(`http://localhost/api/records/export?base=${base.id}`))).text();
    expect(csv).toContain('черновик');
    expect(csv).toContain('проверено');
  });

  it('carries the mode column the grid shows', async () => {
    const base = await seedBase();
    const csv = await (await GET(new Request(`http://localhost/api/records/export?base=${base.id}`))).text();
    const [header] = csv.split('\n');
    expect(header).toContain('Режим');
    expect(csv).toContain(MODE_REFERENCE);
  });

  it('honours the mode filter', async () => {
    const base = await seedBase();
    const url = `http://localhost/api/records/export?base=${base.id}&mode=${encodeURIComponent(MODE_REFERENCE)}`;
    const res = await GET(new Request(url));
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const csv = await res.text();
    expect(csv).toContain('проверено');
    expect(csv).not.toContain('черновик');
  });
});
