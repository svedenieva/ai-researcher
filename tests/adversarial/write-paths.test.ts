import { describe, it, expect, vi, beforeEach } from 'vitest';

// Write paths beyond add_rows/update_record: add_column, rename_base, create_base,
// move_base. The same rules that guard one path must guard its siblings — a hole
// here corrupts the schema or the tree just as effectively.

vi.mock('@/lib/current-user', () => ({ currentEmail: async () => 'alice@example.com' }));

import { POST as mcpPOST } from '@/app/api/mcp/route';
import { getCustomStore } from '@/lib/datasource/customStore';
import { MAX_NAME_CHARS } from '@/lib/limits';

const ALICE = 'alice@example.com';
beforeEach(() => { process.env.MCP_TOKENS = `tok-alice:${ALICE}`; });

async function tool(name: string, args: Record<string, unknown>) {
  const res = await mcpPOST(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer tok-alice' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const raw = (await res.json())?.result?.content?.[0]?.text ?? '';
  if (typeof raw === 'string' && raw.startsWith('Error: ')) return { data: {} as Record<string, unknown>, error: raw.slice(7) };
  return { data: JSON.parse(raw) as Record<string, unknown>, error: null as string | null };
}

async function base(columns = [{ key: 'a', label: 'Первая', type: 'text' as const }]) {
  return getCustomStore().createBase({ name: 'Полигон', columns, owner: ALICE });
}

describe('add_column — метка колонки', () => {
  // add_rows/update_record map a cell by its label; a second column with the same
  // label makes edits land on the wrong one. update_column already rejects this —
  // add_column must too, or the same collision comes in through the back door.
  it('нельзя добавить колонку с уже занятой меткой', async () => {
    const b = await base([{ key: 'a', label: 'Цена', type: 'text' }]);
    const { error } = await tool('add_column', { base: b.id, label: 'Цена' });
    expect(error).toBeTruthy();
    // и колонка действительно не добавилась
    const after = await getCustomStore().getBase(b.id);
    expect(after!.columns.filter((c) => c.label === 'Цена').length).toBe(1);
  });

  // пустая метка уже отклоняется — контроль, чтобы не сломать при правке
  it('пустая метка колонки отклоняется', async () => {
    const b = await base();
    const { error } = await tool('add_column', { base: b.id, label: '   ' });
    expect(error).toBeTruthy();
  });

  // сверхдлинная метка колонки не должна проходить
  it('метка колонки длиннее лимита отклоняется', async () => {
    const b = await base();
    const { error } = await tool('add_column', { base: b.id, label: 'д'.repeat(MAX_NAME_CHARS + 1) });
    expect(error).toBeTruthy();
  });
});

describe('имена баз — потолок длины', () => {
  // REST /api/bases ограничивает длину имени; коннектор обязан не быть мягче,
  // иначе через него льётся имя, которое ломает выдачу и заголовок скачивания.
  it('create_base с именем сверх лимита отклоняется', async () => {
    const { error } = await tool('create_base', {
      name: 'д'.repeat(MAX_NAME_CHARS + 1),
      columns: [{ label: 'Название' }],
    });
    expect(error).toBeTruthy();
  });

  it('rename_base на имя сверх лимита отклоняется', async () => {
    const b = await base();
    const { error } = await tool('rename_base', { base: b.id, name: 'д'.repeat(MAX_NAME_CHARS + 1) });
    expect(error).toBeTruthy();
  });
});

describe('move_base — цикл в дереве (контроль: уже защищено)', () => {
  // база не может стать потомком собственной ветки — иначе /api/records уходит
  // в бесконечную рекурсию при чтении. Фиксируем, чтобы защита не пропала.
  it('нельзя вложить базу в её собственного потомка', async () => {
    const parent = await base();
    const child = await getCustomStore().createBase({
      name: 'Дитя', columns: [{ key: 'a', label: 'A', type: 'text' }], owner: ALICE, parent: parent.id,
    });
    const { error } = await tool('move_base', { base: parent.id, parent: child.id });
    expect(error).toBeTruthy();
  });
});
