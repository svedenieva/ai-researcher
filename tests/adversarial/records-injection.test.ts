import { describe, it, expect, vi, beforeEach } from 'vitest';

// Поверхность ввода строк. /api/records принимает `data` как ЛЮБОЙ объект и
// кладёт его в запись целиком — проверяем, что через это нельзя переписать
// служебные поля, подделать идентификатор строки или залить неограниченный объём.

const who = vi.hoisted(() => ({ me: 'alice@example.com' as string | null }));
vi.mock('@/lib/current-user', () => ({ currentEmail: async () => who.me }));

import { getCustomStore } from '@/lib/datasource/customStore';
import { POST as recordsPOST, PATCH as recordsPATCH, GET as recordsGET } from '@/app/api/records/route';
import { POST as basesPOST } from '@/app/api/bases/route';
import { MODE_KEY, MODE_REFERENCE } from '@/lib/mode';

const ALICE = 'alice@example.com';
const json = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function myBase(columns = [{ key: 'name', label: 'Название', type: 'text' as const }]) {
  return getCustomStore().createBase({ name: 'Полигон', columns, owner: ALICE });
}

beforeEach(() => { who.me = ALICE; });

describe('Подмена идентификатора строки', () => {
  // id строки — единственный якорь для правки, удаления и восстановления.
  // Если его можно задать из тела запроса, две строки сталкиваются, а операции
  // начинают попадать не в ту запись.
  it('POST /api/records не даёт задать собственный id строки', async () => {
    const base = await myBase();
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', {
      base: base.id, data: { name: 'подделка', id: 'подставной-id' },
    }));
    const body = await res.json();
    expect(body.record?.id).not.toBe('подставной-id');
  });

  // если сломается — правка одной строки уводит её идентификатор у другой
  it('PATCH /api/records не даёт переписать id существующей строки', async () => {
    const base = await myBase();
    // id снимаем копией: in-memory хранилище возвращает саму запись по ссылке,
    // и сравнение с original.id после мутации было бы сравнением с самим собой
    const originalId = String((await getCustomStore().addRecord(base.id, { name: 'жертва' })).id);
    await recordsPATCH(json('http://localhost/api/records', 'PATCH', {
      base: base.id, id: originalId, data: { id: 'угнанный-id' },
    }));
    const rows = await getCustomStore().listRecords(base.id);
    expect(rows[0].id).toBe(originalId);
  });

  // две строки с одинаковым id — правка попадает в первую попавшуюся
  it('нельзя создать две строки с одинаковым id', async () => {
    const base = await myBase();
    await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'a', id: 'дубль' } }));
    await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'b', id: 'дубль' } }));
    const rows = await getCustomStore().listRecords(base.id);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Колонка с системным именем', () => {
  // колонка «ID» — совершенно обычное имя в импортируемой таблице; она не должна
  // затирать внутренний идентификатор строки
  it('колонка с меткой «ID» не перехватывает идентификатор строки', async () => {
    const created = await basesPOST(json('http://localhost/api/bases', 'POST', {
      name: 'Импорт с колонкой ID',
      columns: [{ label: 'ID' }, { label: 'Название' }],
      rows: [['ВНЕШНИЙ-1', 'Первая'], ['ВНЕШНИЙ-1', 'Вторая']],
    }));
    const { base } = await created.json();
    const rows = await getCustomStore().listRecords(base.id);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain('ВНЕШНИЙ-1');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Служебные поля записи', () => {
  // «Режим» (черновик/проверено) — системный флаг, а не обычное поле: если его
  // можно записать любым значением, вкладка «Проверено» перестаёт что-то значить
  it('произвольное значение __mode не попадает в хранилище как есть', async () => {
    const base = await myBase();
    await recordsPOST(json('http://localhost/api/records', 'POST', {
      base: base.id, data: { name: 'x', [MODE_KEY]: 'ВЫДУМАННЫЙ-РЕЖИМ' },
    }));
    const rows = await getCustomStore().listRecords(base.id);
    expect(rows[0][MODE_KEY]).not.toBe('ВЫДУМАННЫЙ-РЕЖИМ');
  });

  // допустимое значение режима должно проходить — иначе чекбокс «Проверено» сломан
  it('допустимое значение режима сохраняется', async () => {
    const base = await myBase();
    await recordsPOST(json('http://localhost/api/records', 'POST', {
      base: base.id, data: { name: 'x', [MODE_KEY]: MODE_REFERENCE },
    }));
    const body = await (await recordsGET(new Request(`http://localhost/api/records?base=${base.id}`))).json();
    expect(body.records[0][MODE_KEY]).toBe(MODE_REFERENCE);
  });

  // __pos — внутренний порядок строк; чужая рука в нём переставляет чужие строки
  it('__pos из тела запроса не принимается как поле строки', async () => {
    const base = await myBase();
    await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'x', __pos: -999 } }));
    const rows = await getCustomStore().listRecords(base.id);
    expect(rows[0].__pos).toBeUndefined();
  });

  // __source подставляет строке чужое имя базы в объединённом виде дерева
  it('__source из тела запроса не подменяет источник строки', async () => {
    const base = await myBase();
    await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: 'x', __source: 'Каталог AiVocado' } }));
    const body = await (await recordsGET(new Request(`http://localhost/api/records?base=${base.id}`))).json();
    expect(body.records[0].__source).toBe('Полигон');
  });
});

describe('Загрязнение прототипа', () => {
  // если сломается — один запрос портит объекты во всём процессе сервера
  it('__proto__ в data не загрязняет Object.prototype', async () => {
    const base = await myBase();
    await recordsPOST(json('http://localhost/api/records', 'POST', {
      base: base.id, data: { name: 'x', ['__proto__']: { взломано: true } },
    }));
    expect(({} as Record<string, unknown>).взломано).toBeUndefined();
  });

  // constructor.prototype — второй классический путь того же трюка
  it('constructor в data не ломает создание записей', async () => {
    const base = await myBase();
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', {
      base: base.id, data: { name: 'y', constructor: { prototype: { взломано: true } } },
    }));
    expect(res.status).toBe(200);
    expect(({} as Record<string, unknown>).взломано).toBeUndefined();
  });
});

describe('Типы и мусор в теле запроса', () => {
  // массив вместо объекта превращается в строку с ключами «0», «1» — мусор в базе
  it('массив вместо data отклоняется', async () => {
    const base = await myBase();
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: ['a', 'b'] }));
    expect(res.status).toBe(400);
  });

  // строка/число вместо data
  it('строка или число вместо data не создаёт строку', async () => {
    const base = await myBase();
    await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: 'подстрока' }));
    await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: 42 }));
    expect((await getCustomStore().listRecords(base.id)).length).toBe(0);
  });

  // битое и пустое тело
  it('битый JSON и пустое тело отвечают 400, а не 500', async () => {
    const broken = await recordsPOST(new Request('http://localhost/api/records', { method: 'POST', body: '{' }));
    expect(broken.status).toBe(400);
    const empty = await recordsPOST(new Request('http://localhost/api/records', { method: 'POST' }));
    expect(empty.status).toBe(400);
  });

  // поля вообще не того типа не должны валить роут пятисоткой
  it('base как число или массив — осмысленный отказ, а не 500', async () => {
    for (const base of [42, ['a'], { id: 'x' }, true]) {
      const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base, data: { name: 'x' } }));
      expect([400, 404]).toContain(res.status);
    }
  });
});

describe('Объём ввода', () => {
  // одна ячейка в мегабайты раздувает базу и ответы всем, кто её откроет
  it('значение ячейки в 2 МБ отклоняется', async () => {
    const base = await myBase();
    const huge = 'я'.repeat(2 * 1024 * 1024);
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: huge } }));
    expect(res.status).toBe(400);
  });

  // имя базы без ограничения длины ломает и выдачу, и заголовок скачивания
  it('название базы в 100 000 символов отклоняется', async () => {
    const res = await basesPOST(json('http://localhost/api/bases', 'POST', {
      name: 'д'.repeat(100_000), columns: [{ label: 'Название' }],
    }));
    expect(res.status).toBe(400);
  });

  // импорт «одним куском» без потолка — самый дешёвый способ забить хранилище
  it('импорт 10 000 строк за один запрос отклоняется', async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => [`строка ${i}`]);
    const res = await basesPOST(json('http://localhost/api/bases', 'POST', {
      name: 'Массовый импорт', columns: [{ label: 'Название' }], rows,
    }));
    expect(res.status).toBe(400);
  });

  // глубоко вложенный JSON в ячейке — сериализация ответа станет O(глубины).
  // Глубина 100 заведомо больше серверного потолка (MAX_DEPTH=10), поэтому роут
  // обязан ответить 400. Не 5000: такая вложенность роняет сам JSON.stringify в
  // хелпере (переполнение стека) ещё до вызова роута, и до проверяемой защиты
  // дело просто не доходит — тест мерил бы стек Node, а не поведение сервера.
  it('глубоко вложенный объект в ячейке отклоняется', async () => {
    const base = await myBase();
    let deep: Record<string, unknown> = { конец: true };
    for (let i = 0; i < 100; i++) deep = { вложено: deep };
    const res = await recordsPOST(json('http://localhost/api/records', 'POST', { base: base.id, data: { name: deep } }));
    expect(res.status).toBe(400);
  });
});

describe('Юникод в названиях', () => {
  // если сломается — база без нормального id теряется в дереве
  it('база из одних эмодзи получает пригодный уникальный id', async () => {
    const a = await (await basesPOST(json('http://localhost/api/bases', 'POST', { name: '🎉🎉🎉', columns: [{ label: 'N' }] }))).json();
    const b = await (await basesPOST(json('http://localhost/api/bases', 'POST', { name: '🚀🚀🚀', columns: [{ label: 'N' }] }))).json();
    expect(a.base.id).toBeTruthy();
    expect(b.base.id).toBeTruthy();
    expect(a.base.id).not.toBe(b.base.id);
  });

  // RTL-override переворачивает отображение соседних названий в списке
  it('RTL-override в названии не попадает в id базы', async () => {
    const res = await basesPOST(json('http://localhost/api/bases', 'POST', {
      name: 'отчёт‮gnp.exe', columns: [{ label: 'N' }],
    }));
    const { base } = await res.json();
    expect(base.id).not.toContain('‮');
  });

  // колонки с одинаковой меткой не должны схлопываться в одну
  it('две колонки с одинаковой меткой получают разные ключи', async () => {
    const res = await basesPOST(json('http://localhost/api/bases', 'POST', {
      name: 'Дубли колонок', columns: [{ label: 'Название' }, { label: 'Название' }],
    }));
    const { base } = await res.json();
    const keys = base.columns.map((c: { key: string }) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Опасная схема в колонке-ссылке', () => {
  // Колонка типа url рендерится как <a href={значение}> (см. MindSheet,
  // renderCell). Значение со схемой javascript: превращает клик по ссылке в
  // выполнение кода на нашем домене — от имени того, кто кликнул.
  it('javascript: не сохраняется в колонку типа url', async () => {
    const base = await getCustomStore().createBase({
      name: 'Ссылки',
      columns: [{ key: 'ссылка', label: 'Ссылка', type: 'url' }],
      owner: ALICE,
    });
    await recordsPOST(json('http://localhost/api/records', 'POST', {
      base: base.id, data: { ссылка: "javascript:fetch('/api/bases')" },
    }));
    const rows = await getCustomStore().listRecords(base.id);
    for (const r of rows) expect(String(r.ссылка ?? '')).not.toMatch(/^javascript:/i);
  });

  // data:text/html — тот же эффект, другая схема
  it('data:text/html не сохраняется в колонку типа url', async () => {
    const base = await getCustomStore().createBase({
      name: 'Ссылки 2',
      columns: [{ key: 'ссылка', label: 'Ссылка', type: 'url' }],
      owner: ALICE,
    });
    await recordsPOST(json('http://localhost/api/records', 'POST', {
      base: base.id, data: { ссылка: 'data:text/html,<script>alert(1)</script>' },
    }));
    const rows = await getCustomStore().listRecords(base.id);
    for (const r of rows) expect(String(r.ссылка ?? '')).not.toMatch(/^data:/i);
  });

  // контроль: обычная ссылка обязана сохраняться как есть
  it('обычный https-адрес сохраняется', async () => {
    const base = await getCustomStore().createBase({
      name: 'Ссылки 3',
      columns: [{ key: 'ссылка', label: 'Ссылка', type: 'url' }],
      owner: ALICE,
    });
    await recordsPOST(json('http://localhost/api/records', 'POST', {
      base: base.id, data: { ссылка: 'https://aivocado.com' },
    }));
    const rows = await getCustomStore().listRecords(base.id);
    expect(rows[0].ссылка).toBe('https://aivocado.com');
  });
});
