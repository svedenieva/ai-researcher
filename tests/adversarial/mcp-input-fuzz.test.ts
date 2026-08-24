import { describe, it, expect, vi, beforeEach } from 'vitest';

// Коннектор принимает аргументы от чужой модели — то есть от текста, который
// пишет кто угодно. Кормим его числами вне диапазона, не теми типами,
// гигантскими телами и смотрим, где он молча делает не то, о чём отчитывается.

vi.mock('@/lib/current-user', () => ({ currentEmail: async () => 'alice@example.com' }));

import { POST as mcpPOST } from '@/app/api/mcp/route';
import { getCustomStore } from '@/lib/datasource/customStore';

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

async function baseWithRows(n: number) {
  const store = getCustomStore();
  const base = await store.createBase({
    name: `Пагинация ${n}-${Math.random()}`,
    columns: [{ key: 'name', label: 'Название', type: 'text' }],
    owner: ALICE,
  });
  await store.addRecords(base.id, Array.from({ length: n }, (_, i) => ({ name: `строка ${i}` })));
  return base;
}

describe('query_records — границы пагинации', () => {
  // отрицательный offset превращается в срез с конца: клиент просит первую
  // страницу, получает последние строки и не замечает подмены
  it('отрицательный offset не листает с конца', async () => {
    const base = await baseWithRows(10);
    const { data, error } = await tool('query_records', { base: base.id, offset: -3, limit: 2 });
    if (error) return expect(error).toBeTruthy();
    const names = (data.records as { name: string }[]).map((r) => r.name);
    expect(names[0]).toBe('строка 0');
  });

  // нечисловой limit даёт пустую страницу при hasMore:true — клиент листает вечно
  it('нечисловой limit не даёт пустую страницу с обещанием продолжения', async () => {
    const base = await baseWithRows(10);
    const { data, error } = await tool('query_records', { base: base.id, limit: 'много' });
    if (error) return expect(error).toBeTruthy();
    const empty = (data.records as unknown[]).length === 0;
    expect(empty && data.hasMore === true).toBe(false);
  });

  // offset за пределами набора: пустая страница обязана сказать «дальше ничего нет»
  it('offset за пределами набора сообщает hasMore:false', async () => {
    const base = await baseWithRows(5);
    const { data } = await tool('query_records', { base: base.id, offset: 1000, limit: 10 });
    expect((data.records as unknown[]).length).toBe(0);
    expect(data.hasMore).toBe(false);
  });

  // Infinity/NaN в limit
  it('limit = Infinity и NaN не ломают ответ', async () => {
    const base = await baseWithRows(5);
    for (const limit of [1e18, -1]) {
      const { data, error } = await tool('query_records', { base: base.id, limit });
      if (error) continue;
      expect(Array.isArray(data.records)).toBe(true);
    }
  });

  // limit по умолчанию не должен позволять выкачать всю базу одним запросом
  it('огромный limit ограничивается разумным потолком', async () => {
    // строк заведомо больше потолка, иначе тест прошёл бы «сам собой»
    const base = await baseWithRows(1200);
    const { data } = await tool('query_records', { base: base.id, limit: 1_000_000 });
    expect((data.records as unknown[]).length).toBeLessThanOrEqual(1000);
  });
});

describe('add_rows — типы и объём', () => {
  // позиционный массив вместо объекта — самая частая ошибка вызывающей модели.
  // Отчёт «added: N» при N потерянных строках хуже, чем честная ошибка.
  it('позиционные массивы вместо объектов не отчитываются как успех', async () => {
    const base = await baseWithRows(0);
    const { data, error } = await tool('add_rows', { base: base.id, rows: [['Первая'], ['Вторая']] });
    if (error) return expect(error).toBeTruthy();
    expect(data.added).toBe(0);
    expect((await getCustomStore().listRecords(base.id)).length).toBe(0);
  });

  // rows не массив
  it('rows строкой или объектом не создаёт строк', async () => {
    const base = await baseWithRows(0);
    await tool('add_rows', { base: base.id, rows: 'первая, вторая' });
    await tool('add_rows', { base: base.id, rows: { 'Название': 'x' } });
    expect((await getCustomStore().listRecords(base.id)).length).toBe(0);
  });

  // 10 000 строк за раз — без потолка это способ забить хранилище одним вызовом
  it('10 000 строк за один вызов отклоняются', async () => {
    const base = await baseWithRows(0);
    const rows = Array.from({ length: 10_000 }, (_, i) => ({ 'Название': `строка ${i}` }));
    const { error } = await tool('add_rows', { base: base.id, rows });
    expect(error).toBeTruthy();
  });

  // значение в мегабайты
  it('значение ячейки в 2 МБ отклоняется', async () => {
    const base = await baseWithRows(0);
    const { error } = await tool('add_rows', { base: base.id, rows: [{ 'Название': 'я'.repeat(2 * 1024 * 1024) }] });
    expect(error).toBeTruthy();
  });

  // null / undefined / вложенные структуры в значении
  it('вложенный объект в значении не сохраняется как «[object Object]»', async () => {
    const base = await baseWithRows(0);
    await tool('add_rows', { base: base.id, rows: [{ 'Название': { вложено: true } }] });
    const rows = await getCustomStore().listRecords(base.id);
    expect(rows.map((r) => String(r.name))).not.toContain('[object Object]');
  });
});

describe('update_record — не тот тип', () => {
  // data строкой/массивом не должно молча «обновлять ноль полей»
  it('data не-объектом отвечает ошибкой', async () => {
    const base = await baseWithRows(1);
    const rows = await getCustomStore().listRecords(base.id);
    const { error } = await tool('update_record', { base: base.id, id: String(rows[0].id), data: 'название=новое' });
    expect(error).toBeTruthy();
  });

  // несуществующая строка
  it('несуществующий id строки отвечает ошибкой', async () => {
    const base = await baseWithRows(1);
    const { error } = await tool('update_record', { base: base.id, id: 'нет-такой', data: { 'Название': 'x' } });
    expect(error).toBeTruthy();
  });

  // числовое поле: «двенадцать» должно быть отказом, а не NaN в базе
  it('нечисловое значение в числовой колонке не сохраняется как NaN', async () => {
    const store = getCustomStore();
    const base = await store.createBase({
      name: 'Числа',
      columns: [{ key: 'цена', label: 'Цена', type: 'number' }],
      owner: ALICE,
    });
    await tool('add_rows', { base: base.id, rows: [{ 'Цена': 'двенадцать' }] });
    const rows = await store.listRecords(base.id);
    for (const r of rows) expect(Number.isNaN(r.цена as number)).toBe(false);
  });
});

describe('delete_rows и restore — идемпотентность', () => {
  // повторное удаление не должно отчитываться как новое удаление
  it('повторное удаление тех же строк возвращает 0', async () => {
    const base = await baseWithRows(2);
    const rows = await getCustomStore().listRecords(base.id);
    const ids = rows.map((r) => String(r.id));
    const first = await tool('delete_rows', { base: base.id, ids });
    expect(first.data.deleted).toBe(2);
    const second = await tool('delete_rows', { base: base.id, ids });
    expect(second.data.deleted).toBe(0);
  });

  // восстановление того, что не удаляли
  it('восстановление неудалённых строк возвращает 0', async () => {
    const base = await baseWithRows(2);
    const rows = await getCustomStore().listRecords(base.id);
    const { data } = await tool('restore', { rows: { base: base.id, ids: rows.map((r) => String(r.id)) } });
    expect((data.restored as { rows?: number }).rows).toBe(0);
  });

  // выдуманные id не должны считаться удалёнными
  it('удаление несуществующих id возвращает 0', async () => {
    const base = await baseWithRows(1);
    const { data } = await tool('delete_rows', { base: base.id, ids: ['выдумка-1', 'выдумка-2'] });
    expect(data.deleted).toBe(0);
  });

  // пустой список id
  it('пустой список id отвечает ошибкой, а не «удалено 0»', async () => {
    const base = await baseWithRows(1);
    const { error } = await tool('delete_rows', { base: base.id, ids: [] });
    expect(error).toBeTruthy();
  });
});

describe('research_decompose — расход чужого ключа', () => {
  // инструмент доступен любому валидному токену и уходит в платную модель.
  // Запрос без потолка длины — это неограниченный счёт за чужой ключ.
  it('запрос длиной 1 МБ отклоняется до обращения к модели', async () => {
    const { error } = await tool('research_decompose', { prompt: 'а'.repeat(1024 * 1024) });
    expect(error).toBeTruthy();
  });

  // пустой запрос
  it('пустой запрос отвечает ошибкой', async () => {
    const { error } = await tool('research_decompose', { prompt: '   ' });
    expect(error).toBeTruthy();
  });

  // без ключа модели инструмент обязан отвечать эвристикой, а не падать
  it('без ANTHROPIC_API_KEY отвечает эвристикой', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { data, error } = await tool('research_decompose', { prompt: 'рынок ИИ-агентов' });
    expect(error).toBeNull();
    expect(data.source).toBe('heuristic');
    expect((data.subtopics as string[]).length).toBeGreaterThan(0);
  });
});

describe('Неизвестные методы и инструменты', () => {
  // неизвестный инструмент не должен выполнять ничего похожего
  it('неизвестный инструмент отвечает ошибкой', async () => {
    const { error } = await tool('delete_everything', {});
    expect(error).toContain('unknown tool');
  });

  // подмена регистра имени инструмента
  it('имя инструмента в другом регистре не выполняется', async () => {
    const { error } = await tool('DELETE_BASE', { base: 'market' });
    expect(error).toBeTruthy();
  });

  // отсутствующие обязательные аргументы
  it('вызов без обязательных аргументов отвечает ошибкой, а не падает', async () => {
    for (const name of ['get_base', 'add_rows', 'update_record', 'delete_rows', 'rename_base', 'move_base', 'delete_base']) {
      const { error } = await tool(name, {});
      expect({ name, hasError: Boolean(error) }).toEqual({ name, hasError: true });
    }
  });

  // аргументы не того типа не должны валить процесс
  it('аргументы не того типа не роняют роут', async () => {
    for (const args of [{ base: 42 }, { base: null }, { base: ['a'] }, { base: { id: 'x' } }]) {
      const { error } = await tool('get_base', args as Record<string, unknown>);
      expect(error).toBeTruthy();
    }
  });
});
