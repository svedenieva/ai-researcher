import { describe, it, expect, beforeAll } from 'vitest';
import { POST } from './route';
import { getCustomStore } from '@/lib/datasource/customStore';

// The bin tools are the destructive corner of the connector: they used to call
// the store with no access check, so any token could read every teammate's
// deleted base names and permanently wipe the whole team's trash. These tests
// pin the rule that a token only ever sees and destroys its own bin.

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';

beforeAll(() => {
  process.env.MCP_TOKENS = `tok-alice:${ALICE},tok-bob:${BOB}`;
});

function call(token: string, name: string, args: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    }),
  );
}

// tool results arrive as { content: [{ type: 'text', text: '<json or Error: …>' }] }
async function toolResult(res: Response): Promise<{ data: Record<string, unknown>; error: string | null }> {
  const body = await res.json();
  const raw = body?.result?.content?.[0]?.text ?? '';
  if (typeof raw === 'string' && raw.startsWith('Error: ')) return { data: {}, error: raw.slice(7) };
  return { data: JSON.parse(raw), error: null };
}

/** A private base owned by `owner`, holding one row, soft-deleted into the bin. */
async function binnedBaseOf(owner: string, name: string) {
  const store = getCustomStore();
  const base = await store.createBase({
    name,
    columns: [{ key: 'name', label: 'Название', type: 'text' }],
    owner,
  });
  await store.addRecord(base.id, { name: `${name}-строка` });
  await store.softDeleteBase(base.id);
  return base;
}

describe('MCP bin tools — access scoping', () => {
  it('list_bin hides another user\'s deleted base', async () => {
    const secret = await binnedBaseOf(BOB, 'Приватная Боба');
    const mine = await binnedBaseOf(ALICE, 'Приватная Алисы');

    const { data } = await toolResult(await call('tok-alice', 'list_bin'));
    const ids = (data.bases as { id: string }[]).map((b) => b.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(secret.id);
  });

  it('restore refuses another user\'s binned base, and it stays deleted', async () => {
    const secret = await binnedBaseOf(BOB, 'Не трогать');

    const { error } = await toolResult(await call('tok-alice', 'restore', { base: secret.id }));
    expect(error).toBe('base not found in trash');
    expect(await getCustomStore().getBase(secret.id)).toBeNull();
  });

  it('restore still works on your own binned base', async () => {
    const mine = await binnedBaseOf(ALICE, 'Моя база');

    const { data, error } = await toolResult(await call('tok-alice', 'restore', { base: mine.id }));
    expect(error).toBeNull();
    expect((data.restored as { base?: string }).base).toBe(mine.id);
    expect(await getCustomStore().getBase(mine.id)).not.toBeNull();
  });

  // the one that matters: an unscoped empty_bin used to delete the whole table
  it('empty_bin destroys only your own trash', async () => {
    const store = getCustomStore();
    const theirs = await binnedBaseOf(BOB, 'Корзина Боба');
    const mine = await binnedBaseOf(ALICE, 'Корзина Алисы');

    const { data, error } = await toolResult(await call('tok-alice', 'empty_bin', { confirm: true }));
    expect(error).toBeNull();
    expect(data.emptied).toBe(true);

    const bin = await store.listBin();
    const left = bin.bases.map((b) => b.id);
    expect(left).not.toContain(mine.id); // mine is gone for good
    expect(left).toContain(theirs.id); // Bob's is untouched
  });

  it('empty_bin refuses a scope that is not yours', async () => {
    const theirs = await binnedBaseOf(BOB, 'Чужой скоуп');

    const { error } = await toolResult(await call('tok-alice', 'empty_bin', { base: theirs.id, confirm: true }));
    expect(error).toBe('base not found in trash');
    expect((await getCustomStore().listBin()).bases.map((b) => b.id)).toContain(theirs.id);
  });

  it('the dry run counts only your own trash', async () => {
    await binnedBaseOf(BOB, 'Боб ещё раз');
    const mine = await binnedBaseOf(ALICE, 'Алиса ещё раз');

    const { data } = await toolResult(await call('tok-alice', 'empty_bin'));
    expect(data.dryRun).toBe(true);
    const { baseCount } = data.wouldDelete as { baseCount: number };
    const allBinned = (await getCustomStore().listBin()).bases.length;
    expect(baseCount).toBeGreaterThanOrEqual(1);
    expect(baseCount).toBeLessThan(allBinned);
    expect(mine.id).toBeTruthy();
  });
});

describe('MCP auth', () => {
  it('rejects a call with no token', async () => {
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_bin' } }),
      }),
    );
    const body = await res.json();
    expect(body.error?.code).toBe(-32001);
  });
});
