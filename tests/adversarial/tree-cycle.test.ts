import { describe, it, expect, vi, beforeEach } from 'vitest';

// Дерево баз. Обход дерева в /api/records рекурсивный и без защиты от повторов,
// поэтому цикл в parent — это не «некрасиво», а бесконечная рекурсия при чтении.
// Проверяем, можно ли цикл создать и что происходит, если он всё-таки возник.

const who = vi.hoisted(() => ({ me: 'alice@example.com' as string | null }));
vi.mock('@/lib/current-user', () => ({ currentEmail: async () => who.me }));

import { getCustomStore } from '@/lib/datasource/customStore';
import { GET as recordsGET } from '@/app/api/records/route';
import { PATCH as basesPATCH, DELETE as basesDELETE, GET as basesGET } from '@/app/api/bases/route';
import { POST as mcpPOST } from '@/app/api/mcp/route';

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';

const json = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const COL = [{ key: 'name', label: 'Название', type: 'text' as const }];

function mcp(token: string, name: string, args: Record<string, unknown>) {
  return mcpPOST(json('http://localhost/api/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }));
}
async function mcpAuth(token: string, name: string, args: Record<string, unknown>) {
  const res = await mcpPOST(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const raw = (await res.json())?.result?.content?.[0]?.text ?? '';
  return typeof raw === 'string' && raw.startsWith('Error: ')
    ? { data: {} as Record<string, unknown>, error: raw.slice(7) }
    : { data: JSON.parse(raw) as Record<string, unknown>, error: null as string | null };
}

beforeEach(() => {
  who.me = ALICE;
  process.env.MCP_TOKENS = `tok-alice:${ALICE},tok-bob:${BOB}`;
});

describe('Циклы в дереве баз — прямые попытки', () => {
  // контроль: очевидный цикл ловится
  it('база не может стать родителем самой себе', async () => {
    const a = await getCustomStore().createBase({ name: 'Сама себе', columns: COL, owner: ALICE });
    expect((await basesPATCH(json('http://localhost/api/bases', 'PATCH', { id: a.id, parent: a.id }))).status).toBe(400);
    expect((await mcpAuth('tok-alice', 'move_base', { base: a.id, parent: a.id })).error).toBeTruthy();
  });

  // контроль: цикл из двух своих баз ловится
  it('цикл A→B→A из своих же баз отклоняется', async () => {
    const store = getCustomStore();
    const a = await store.createBase({ name: 'ЦиклA', columns: COL, owner: ALICE });
    const b = await store.createBase({ name: 'ЦиклB', columns: COL, owner: ALICE, parent: a.id });
    expect((await basesPATCH(json('http://localhost/api/bases', 'PATCH', { id: a.id, parent: b.id }))).status).toBe(400);
  });

  // цикл длиной три звена — та же бесконечная рекурсия, просто дальше по цепочке
  it('цикл A→B→C→A отклоняется', async () => {
    const store = getCustomStore();
    const a = await store.createBase({ name: 'Трио A', columns: COL, owner: ALICE });
    const b = await store.createBase({ name: 'Трио B', columns: COL, owner: ALICE, parent: a.id });
    const c = await store.createBase({ name: 'Трио C', columns: COL, owner: ALICE, parent: b.id });
    expect((await basesPATCH(json('http://localhost/api/bases', 'PATCH', { id: a.id, parent: c.id }))).status).toBe(400);
  });
});

describe('Циклы в дереве баз — через невидимое звено', () => {
  // Проверка цикла в /api/bases смотрит только на базы, ВИДИМЫЕ проверяющему.
  // Достаточно одного чужого приватного звена в цепочке, чтобы проверка ослепла.
  it('цикл через чужую приватную базу-посредника отклоняется', async () => {
    const store = getCustomStore();
    // общая (безвладельческая) база — её видят все
    const общая = await store.createBase({ name: 'Общая ветка', columns: COL, owner: null });
    // приватная база Боба, подвешенная под общую
    const бобова = await store.createBase({ name: 'Приватная Боба', columns: COL, owner: BOB, parent: общая.id });

    // Алиса не видит базу Боба — и двигает общую базу под неё
    const res = await basesPATCH(json('http://localhost/api/bases', 'PATCH', { id: общая.id, parent: бобова.id }));
    expect(res.status).toBe(400);
    expect((await store.getBase(общая.id))!.parent).not.toBe(бобова.id);
  });

  // Если цикл всё же образовался, чтение базы обязано ответить, а не уйти в
  // бесконечную рекурсию и отдать 500 всем, кто эту ветку открывает.
  it('уже существующий цикл не превращает чтение базы в 500', async () => {
    const store = getCustomStore();
    const a = await store.createBase({ name: 'Битая A', columns: COL, owner: null });
    const b = await store.createBase({ name: 'Битая B', columns: COL, owner: null, parent: a.id });
    await store.addRecord(a.id, { name: 'строка A' });
    // замыкаем цикл в обход роутов — так, как это оставила бы любая гонка или
    // ослепшая проверка выше
    await store.moveBase(a.id, b.id);

    const res = await recordsGET(new Request(`http://localhost/api/records?base=${a.id}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.records)).toBe(true);
  });

  // тот же цикл не должен ронять и список баз для переключателя
  it('цикл не ломает GET /api/bases', async () => {
    const store = getCustomStore();
    const a = await store.createBase({ name: 'Кольцо A', columns: COL, owner: null });
    const b = await store.createBase({ name: 'Кольцо B', columns: COL, owner: null, parent: a.id });
    await store.moveBase(a.id, b.id);
    const res = await basesGET();
    expect(res.status).toBe(200);
  });
});

describe('Родитель, которого нет', () => {
  // create_base принимает parent как есть, без проверки: база уезжает под
  // несуществующий или чужой узел, и дерево перестаёт отражать реальность
  it('create_base с несуществующим родителем отклоняется', async () => {
    const { error } = await mcpAuth('tok-alice', 'create_base', {
      name: 'Сирота', columns: [{ label: 'Название' }], parent: 'такого-id-нет',
    });
    expect(error).toBeTruthy();
  });

  // подвесить свою базу под ЧУЖУЮ приватную — способ подмешать свои строки
  // в чужой объединённый вид дерева
  it('create_base с чужим приватным родителем отклоняется', async () => {
    const чужая = await getCustomStore().createBase({ name: 'Чужой узел', columns: COL, owner: BOB });
    const { error } = await mcpAuth('tok-alice', 'create_base', {
      name: 'Подкидыш', columns: [{ label: 'Название' }], parent: чужая.id,
    });
    expect(error).toBeTruthy();
  });

  // контроль: move_base на чужого родителя тоже не должен проходить
  it('move_base под чужого приватного родителя отклоняется', async () => {
    const store = getCustomStore();
    const моя = await store.createBase({ name: 'Моя', columns: COL, owner: ALICE });
    const чужая = await store.createBase({ name: 'Чужая цель', columns: COL, owner: BOB });
    const { error } = await mcpAuth('tok-alice', 'move_base', { base: моя.id, parent: чужая.id });
    expect(error).toBeTruthy();
  });
});

describe('Корзина и целостность дерева', () => {
  // ребёнок удалённого родителя не должен исчезать бесследно
  it('удаление базы с детьми не теряет детей', async () => {
    const store = getCustomStore();
    const родитель = await store.createBase({ name: 'Родитель', columns: COL, owner: ALICE });
    const ребёнок = await store.createBase({ name: 'Ребёнок', columns: COL, owner: ALICE, parent: родитель.id });
    await basesDELETE(json('http://localhost/api/bases', 'DELETE', { id: родитель.id }));
    const body = await (await basesGET()).json();
    expect(body.bases.map((b: { id: string }) => b.id)).toContain(ребёнок.id);
  });

  // двойное восстановление не должно рапортовать об успехе во второй раз
  it('повторное восстановление уже восстановленной базы отклоняется', async () => {
    const store = getCustomStore();
    const b = await store.createBase({ name: 'Двойной restore', columns: COL, owner: ALICE });
    await store.softDeleteBase(b.id);
    const first = await basesDELETE(json('http://localhost/api/bases', 'DELETE', { id: b.id, restore: true }));
    expect(first.status).toBe(200);
    const second = await basesDELETE(json('http://localhost/api/bases', 'DELETE', { id: b.id, restore: true }));
    expect(second.status).toBe(404);
  });

  // восстановление того, чего не было
  it('восстановление несуществующей базы отвечает 404', async () => {
    const res = await basesDELETE(json('http://localhost/api/bases', 'DELETE', { id: 'никогда-не-было', restore: true }));
    expect(res.status).toBe(404);
  });

  // встроенный каталог в корзине не лежит и восстановлению не подлежит
  it('restore встроенной базы через MCP отклоняется', async () => {
    const { error } = await mcpAuth('tok-alice', 'restore', { base: 'market' });
    expect(error).toBeTruthy();
  });
});

describe('Колонки и зависящие от них представления', () => {
  // фильтр/сортировка по удалённой колонке не должны ронять чтение базы
  it('чтение базы с сортировкой по удалённой колонке не падает', async () => {
    const store = getCustomStore();
    const base = await store.createBase({
      name: 'Колонки',
      columns: [{ key: 'name', label: 'Название', type: 'text' }, { key: 'цена', label: 'Цена', type: 'number' }],
      owner: ALICE,
    });
    await store.addRecord(base.id, { name: 'a', цена: 1 });
    await store.deleteColumn(base.id, 'цена');
    const res = await recordsGET(new Request(`http://localhost/api/records?base=${base.id}&sortKey=цена&sortDir=desc&f=цена:1`));
    expect(res.status).toBe(200);
  });

  // колонка с пустой меткой — невидимый столбец, который нельзя ни выбрать, ни убрать
  it('колонка с пустой меткой не создаётся', async () => {
    const store = getCustomStore();
    const base = await store.createBase({ name: 'Пустая метка', columns: COL, owner: ALICE });
    const before = (await store.getBase(base.id))!.columns.length;
    await mcpAuth('tok-alice', 'add_column', { base: base.id, label: '   ' });
    expect((await store.getBase(base.id))!.columns.length).toBe(before);
  });

  // переименование колонки в имя-дубль делает две одинаковые шапки в CSV
  it('переименование колонки в уже занятую метку отклоняется', async () => {
    const store = getCustomStore();
    const base = await store.createBase({
      name: 'Дубль метки',
      columns: [{ key: 'a', label: 'Первая', type: 'text' }, { key: 'b', label: 'Вторая', type: 'text' }],
      owner: ALICE,
    });
    const { error } = await mcpAuth('tok-alice', 'update_column', { base: base.id, key: 'b', label: 'Первая' });
    expect(error).toBeTruthy();
  });
});
