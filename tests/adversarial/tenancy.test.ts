import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мультиарендность: у каждого эндпоинта, принимающего id, спрашиваем чужой id.
// Чужую приватную базу нельзя ни прочитать, ни записать, ни переименовать,
// ни удалить, ни восстановить, ни выгрузить в CSV.

const who = vi.hoisted(() => ({ me: 'alice@example.com' as string | null }));
vi.mock('@/lib/current-user', () => ({ currentEmail: async () => who.me }));

import { getCustomStore } from '@/lib/datasource/customStore';
import { GET as recordsGET, POST as recordsPOST, PATCH as recordsPATCH, DELETE as recordsDELETE } from '@/app/api/records/route';
import { GET as exportGET } from '@/app/api/records/export/route';
import { POST as reorderPOST } from '@/app/api/records/reorder/route';
import { POST as columnsPOST } from '@/app/api/columns/route';
import { GET as basesGET, PATCH as basesPATCH, DELETE as basesDELETE } from '@/app/api/bases/route';
import { GET as binGET, DELETE as binDELETE } from '@/app/api/bin/route';

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';

const json = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Приватная база Боба с одной строкой. */
async function bobsBase(name = 'Секретная база Боба') {
  const store = getCustomStore();
  const base = await store.createBase({
    name,
    columns: [{ key: 'name', label: 'Название', type: 'text' }],
    owner: BOB,
  });
  const row = await store.addRecord(base.id, { name: 'СОВЕРШЕННО-СЕКРЕТНО' });
  return { base, row };
}

beforeEach(() => { who.me = ALICE; });

describe('Чужая приватная база — чтение', () => {
  // если сломается — приватные исследования коллег читает любой сотрудник
  it('GET /api/records по чужому id отвечает 404 и не отдаёт содержимое', async () => {
    const { base } = await bobsBase();
    const res = await recordsGET(new Request(`http://localhost/api/records?base=${base.id}`));
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('СОВЕРШЕННО-СЕКРЕТНО');
  });

  // выгрузка — тот же доступ к данным, только файлом
  it('GET /api/records/export по чужому id не отдаёт CSV', async () => {
    const { base } = await bobsBase();
    const res = await exportGET(new Request(`http://localhost/api/records/export?base=${base.id}`));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toContain('text/csv');
    expect(await res.text()).not.toContain('СОВЕРШЕННО-СЕКРЕТНО');
  });

  // список баз не должен подсказывать, что чужая база вообще существует
  it('GET /api/bases не показывает чужую приватную базу', async () => {
    const { base } = await bobsBase('Уникальное имя Боба');
    const body = await (await basesGET()).json();
    expect(body.bases.map((b: { id: string }) => b.id)).not.toContain(base.id);
    expect(JSON.stringify(body)).not.toContain('Уникальное имя Боба');
  });

  // корзина приватна так же, как и живые базы
  it('GET /api/bin не показывает удалённую базу Боба', async () => {
    const { base } = await bobsBase('Удалённая база Боба');
    await getCustomStore().softDeleteBase(base.id);
    const body = await (await binGET()).json();
    expect(JSON.stringify(body)).not.toContain('Удалённая база Боба');
  });
});

describe('Чужая приватная база — запись', () => {
  // если сломается — в чужую базу можно подбрасывать строки
  it('POST /api/records в чужую базу отклоняется', async () => {
    const { base } = await bobsBase();
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'подброшено' } }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().listRecords(base.id)).length).toBe(1);
  });

  // если сломается — чужие данные можно молча переписать
  it('PATCH /api/records по чужой строке отклоняется и не меняет её', async () => {
    const { base, row } = await bobsBase();
    const res = await recordsPATCH(json('http://localhost/api/records', 'PATCH', { base: base.id, id: row.id, data: { name: 'испорчено' } }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().listRecords(base.id))[0].name).toBe('СОВЕРШЕННО-СЕКРЕТНО');
  });

  // если сломается — чужие строки можно смахнуть в корзину
  it('DELETE /api/records по чужой строке отклоняется', async () => {
    const { base, row } = await bobsBase();
    const res = await recordsDELETE(json('http://localhost/api/records', 'DELETE', { base: base.id, ids: [row.id] }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().listRecords(base.id)).length).toBe(1);
  });

  // порядок строк — тоже содержимое чужой базы
  it('POST /api/records/reorder по чужой базе отклоняется', async () => {
    const { base, row } = await bobsBase();
    const res = await reorderPOST(json('http://localhost/api/records/reorder', 'POST', { base: base.id, order: [row.id] }));
    expect(res.status).toBe(404);
  });

  // структура чужой базы неприкосновенна
  it('POST /api/columns по чужой базе отклоняется', async () => {
    const { base } = await bobsBase();
    const before = (await getCustomStore().getBase(base.id))!.columns.length;
    const res = await columnsPOST(json('http://localhost/api/columns', 'POST', { base: base.id, action: 'add', column: { label: 'Взлом' } }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().getBase(base.id))!.columns.length).toBe(before);
  });

  // удаление колонки у соседа обесценивает его фильтры и группировки
  it('удаление колонки в чужой базе отклоняется', async () => {
    const { base } = await bobsBase();
    const res = await columnsPOST(json('http://localhost/api/columns', 'POST', { base: base.id, action: 'delete', key: 'name' }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().getBase(base.id))!.columns.some((c) => c.key === 'name')).toBe(true);
  });
});

describe('Чужая приватная база — жизненный цикл', () => {
  // если сломается — чужую базу можно переименовать
  it('PATCH /api/bases (переименование) по чужой базе отклоняется', async () => {
    const { base } = await bobsBase();
    const res = await basesPATCH(json('http://localhost/api/bases', 'PATCH', { id: base.id, name: 'Моя теперь' }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().getBase(base.id))!.name).toBe('Секретная база Боба');
  });

  // если сломается — чужую базу можно утащить к себе в дерево
  it('PATCH /api/bases (перемещение) по чужой базе отклоняется', async () => {
    const { base } = await bobsBase();
    const mine = await getCustomStore().createBase({ name: 'Моя папка', columns: [{ key: 'n', label: 'N', type: 'text' }], owner: ALICE });
    const res = await basesPATCH(json('http://localhost/api/bases', 'PATCH', { id: base.id, parent: mine.id }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().getBase(base.id))!.parent).toBeNull();
  });

  // если сломается — чужую базу можно удалить
  it('DELETE /api/bases по чужой базе отклоняется', async () => {
    const { base } = await bobsBase();
    const res = await basesDELETE(json('http://localhost/api/bases', 'DELETE', { id: base.id }));
    expect(res.status).toBe(404);
    expect(await getCustomStore().getBase(base.id)).not.toBeNull();
  });

  // восстановление из ЧУЖОЙ корзины — способ вытащить чужие данные наружу
  it('восстановление чужой базы из корзины отклоняется', async () => {
    const { base } = await bobsBase();
    await getCustomStore().softDeleteBase(base.id);
    const res = await basesDELETE(json('http://localhost/api/bases', 'DELETE', { id: base.id, restore: true }));
    expect(res.status).toBe(404);
    expect(await getCustomStore().getBase(base.id)).toBeNull();
  });

  // восстановление чужих СТРОК — та же дыра, только мельче
  it('восстановление чужих строк через DELETE /api/records отклоняется', async () => {
    const { base, row } = await bobsBase();
    await getCustomStore().softDeleteRecords(base.id, [row.id]);
    const res = await recordsDELETE(json('http://localhost/api/records', 'DELETE', { base: base.id, ids: [row.id], restore: true }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().listRecords(base.id)).length).toBe(0);
  });

  // очистка корзины по чужому скоупу = безвозвратное уничтожение чужих данных
  it('DELETE /api/bin по чужому baseId отклоняется и ничего не стирает', async () => {
    const { base } = await bobsBase();
    await getCustomStore().softDeleteBase(base.id);
    const res = await binDELETE(json('http://localhost/api/bin', 'DELETE', { baseId: base.id, confirm: true }));
    expect(res.status).toBe(404);
    expect((await getCustomStore().listBin()).bases.map((b) => b.id)).toContain(base.id);
  });

  // «очистить всё» не должно вычищать чужие корзины заодно
  it('DELETE /api/bin без скоупа не трогает корзину Боба', async () => {
    const { base: theirs } = await bobsBase('Корзина Боба');
    await getCustomStore().softDeleteBase(theirs.id);
    const mine = await getCustomStore().createBase({ name: 'Корзина Алисы', columns: [{ key: 'n', label: 'N', type: 'text' }], owner: ALICE });
    await getCustomStore().softDeleteBase(mine.id);

    await binDELETE(json('http://localhost/api/bin', 'DELETE', { confirm: true }));
    const left = (await getCustomStore().listBin()).bases.map((b) => b.id);
    expect(left).toContain(theirs.id);
    expect(left).not.toContain(mine.id);
  });
});

describe('Встроенные базы только для чтения', () => {
  const builtins = ['market', 'ai', 'it', 'workforce'];

  // если сломается — общий каталог продуктов можно править кому угодно
  it('в каталог нельзя добавить строку', async () => {
    for (const id of builtins) {
      const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: id, data: { name: 'x' } }));
      expect({ id, status: res.status }).toEqual({ id, status: 400 });
    }
  });

  it('строку каталога нельзя изменить или удалить', async () => {
    expect((await recordsPATCH(json('http://localhost/api/records', 'PATCH', { base: 'market', id: 'openai', data: { name: 'x' } }))).status).toBe(400);
    expect((await recordsDELETE(json('http://localhost/api/records', 'DELETE', { base: 'market', ids: ['openai'] }))).status).toBe(400);
  });

  it('каталог нельзя переименовать, переместить или удалить', async () => {
    expect((await basesPATCH(json('http://localhost/api/bases', 'PATCH', { id: 'market', name: 'Мой рынок' }))).status).toBe(400);
    expect((await basesPATCH(json('http://localhost/api/bases', 'PATCH', { id: 'ai', parent: 'it' }))).status).toBe(400);
    expect((await basesDELETE(json('http://localhost/api/bases', 'DELETE', { id: 'workforce' }))).status).toBe(400);
  });

  it('колонки каталога нельзя менять', async () => {
    expect((await columnsPOST(json('http://localhost/api/columns', 'POST', { base: 'market', action: 'delete', key: 'name' }))).status).toBe(400);
  });

  it('порядок строк каталога нельзя менять', async () => {
    expect((await reorderPOST(json('http://localhost/api/records/reorder', 'POST', { base: 'it', order: ['a'] }))).status).toBe(400);
  });
});

describe('Утечка чужих почт', () => {
  // список баз показывает владельца; почта коллеги — персональные данные,
  // и в общем списке ей делать нечего
  it('GET /api/bases не раскрывает почту владельца чужой общей базы', async () => {
    await getCustomStore().createBase({
      name: 'Общая командная',
      columns: [{ key: 'n', label: 'N', type: 'text' }],
      owner: BOB,
      shared: true,
    });
    const text = JSON.stringify(await (await basesGET()).json());
    expect(text).not.toContain(BOB);
  });
});
