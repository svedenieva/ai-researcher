import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Что вылезает наружу, когда база отвалилась. Сообщения Supabase содержат имя
// проекта, имена таблиц и — если ключ попал в текст ошибки — сам ключ.
// Пользователю нужен факт «не получилось», а не внутренности.

const who = vi.hoisted(() => ({ me: 'alice@example.com' as string | null }));
vi.mock('@/lib/current-user', () => ({ currentEmail: async () => who.me }));

import { getCustomStore } from '@/lib/datasource/customStore';
import { POST as recordsPOST, PATCH as recordsPATCH, GET as recordsGET } from '@/app/api/records/route';
import { POST as reorderPOST } from '@/app/api/records/reorder/route';
import { POST as columnsPOST } from '@/app/api/columns/route';
import { POST as basesPOST } from '@/app/api/bases/route';
import { POST as mcpPOST } from '@/app/api/mcp/route';

const ALICE = 'alice@example.com';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SERVICE-ROLE-SECRET';
const INTERNAL = `Supabase (base_records): permission denied for relation base_records at https://abcdefgh.supabase.co with key ${SERVICE_KEY}`;

const json = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Ответ не должен содержать ни ключа, ни адреса проекта, ни имён таблиц. */
function expectNoInternals(text: string) {
  expect(text).not.toContain(SERVICE_KEY);
  expect(text).not.toContain('supabase.co');
  expect(text).not.toContain('base_records');
  expect(text).not.toContain('permission denied');
}

let base: { id: string };

beforeEach(async () => {
  who.me = ALICE;
  process.env.MCP_TOKENS = `tok-alice:${ALICE}`;
  base = await getCustomStore().createBase({
    name: 'Полигон ошибок',
    columns: [{ key: 'name', label: 'Название', type: 'text' }],
    owner: ALICE,
  });
  await getCustomStore().addRecord(base.id, { name: 'строка' });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Внутренняя ошибка хранилища наружу', () => {
  // если сломается — ключ service_role уезжает в браузер вместе с ошибкой
  it('POST /api/records не пересказывает текст ошибки Supabase', async () => {
    vi.spyOn(getCustomStore(), 'addRecord').mockRejectedValue(new Error(INTERNAL));
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'x' } }));
    expect(res.status).toBe(500);
    expectNoInternals(await res.text());
  });

  it('PATCH /api/records не пересказывает текст ошибки Supabase', async () => {
    vi.spyOn(getCustomStore(), 'updateRecord').mockRejectedValue(new Error(INTERNAL));
    const rows = await getCustomStore().listRecords(base.id);
    const res = await recordsPATCH(json('http://localhost/api/records', 'PATCH', { base: base.id, id: String(rows[0].id), data: { name: 'y' } }));
    expectNoInternals(await res.text());
  });

  it('POST /api/records/reorder не пересказывает текст ошибки Supabase', async () => {
    vi.spyOn(getCustomStore(), 'reorderRecords').mockRejectedValue(new Error(INTERNAL));
    const res = await reorderPOST(json('http://localhost/api/records/reorder', 'POST', { base: base.id, order: ['r1'] }));
    expectNoInternals(await res.text());
  });

  it('POST /api/columns не пересказывает текст ошибки Supabase', async () => {
    vi.spyOn(getCustomStore(), 'addColumn').mockRejectedValue(new Error(INTERNAL));
    const res = await columnsPOST(json('http://localhost/api/columns', 'POST', { base: base.id, action: 'add', column: { label: 'Новая' } }));
    expectNoInternals(await res.text());
  });

  it('POST /api/bases не пересказывает текст ошибки Supabase', async () => {
    vi.spyOn(getCustomStore(), 'createBase').mockRejectedValue(new Error(INTERNAL));
    const res = await basesPOST(json('http://localhost/api/bases', 'POST', { name: 'Новая', columns: [{ label: 'Название' }] }));
    expectNoInternals(await res.text());
  });

  // тот же путь через коннектор: ошибка инструмента уходит в чужую модель
  it('MCP-инструмент не пересказывает текст ошибки Supabase', async () => {
    vi.spyOn(getCustomStore(), 'addRecords').mockRejectedValue(new Error(INTERNAL));
    const res = await mcpPOST(new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer tok-alice' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_rows', arguments: { base: base.id, rows: [{ 'Название': 'x' }] } } }),
    }));
    expectNoInternals(await res.text());
  });
});

describe('Что уже сделано правильно', () => {
  // контроль: путь чтения уже отвечает обобщённо — фиксируем, чтобы не сползло
  it('GET /api/records при упавшем хранилище отвечает обобщённо', async () => {
    vi.spyOn(getCustomStore(), 'getBase').mockRejectedValue(new Error(INTERNAL));
    const res = await recordsGET(new Request(`http://localhost/api/records?base=${base.id}`));
    expect(res.status).toBe(500);
    expectNoInternals(await res.text());
  });

  // стек вызовов не должен попадать в ответ ни при каких обстоятельствах
  it('стек вызовов не попадает в ответ', async () => {
    vi.spyOn(getCustomStore(), 'addRecord').mockRejectedValue(new Error('внутренняя поломка'));
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'x' } }));
    const text = await res.text();
    expect(text).not.toContain('at Object');
    expect(text).not.toContain('node_modules');
    expect(text).not.toContain('.ts:');
  });

  // хранилище вернуло null вместо объекта — не должно быть 500 с TypeError
  it('null из хранилища не превращается в TypeError', async () => {
    vi.spyOn(getCustomStore(), 'getBase').mockResolvedValue(null);
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'x' } }));
    expect(res.status).toBe(404);
  });

  // ошибки не должны раскрывать чужие почты
  it('в ответе об ошибке нет чужих адресов', async () => {
    vi.spyOn(getCustomStore(), 'addRecord').mockRejectedValue(new Error('конфликт с bob@example.com'));
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'x' } }));
    expect(await res.text()).not.toContain('bob@example.com');
  });
});
