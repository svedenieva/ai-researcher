import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST, GET } from '@/app/api/mcp/route';
import { parseTokens, emailForToken } from '@/lib/mcp/tokens';

// Личный токен — единственный ключ к чужим базам через коннектор. Здесь мы
// пытаемся войти без него, с обрезанным, с чужим и с отозванным.

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';
const saved = process.env.MCP_TOKENS;

beforeEach(() => {
  process.env.MCP_TOKENS = `tok-alice-secret:${ALICE},tok-bob-secret:${BOB}`;
});
afterEach(() => {
  if (saved === undefined) delete process.env.MCP_TOKENS;
  else process.env.MCP_TOKENS = saved;
});

function rpc(headers: Record<string, string>, body: unknown, url = 'http://localhost/api/mcp') {
  return POST(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));
}
const listBases = (headers: Record<string, string>, url?: string) =>
  rpc(headers, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_bases' } }, url);

async function isRejected(res: Response): Promise<boolean> {
  const body = await res.json();
  return body?.error?.code === -32001;
}

describe('MCP — приём токена', () => {
  // если сломается — коннектор отдаёт чужие базы кому угодно
  it('без заголовка Authorization вызов инструмента отклоняется', async () => {
    expect(await isRejected(await listBases({}))).toBe(true);
  });

  // пустой токен не должен считаться валидным
  it('пустой Bearer-токен отклоняется', async () => {
    expect(await isRejected(await listBases({ authorization: 'Bearer ' }))).toBe(true);
    expect(await isRejected(await listBases({ authorization: 'Bearer' }))).toBe(true);
  });

  // подделка: префикс настоящего токена
  it('префикс настоящего токена не подходит', async () => {
    expect(await isRejected(await listBases({ authorization: 'Bearer tok-alice' }))).toBe(true);
    expect(await isRejected(await listBases({ authorization: 'Bearer tok-alice-secre' }))).toBe(true);
  });

  // подделка: токен с приписанным хвостом
  it('токен с приписанным хвостом не подходит', async () => {
    expect(await isRejected(await listBases({ authorization: 'Bearer tok-alice-secretX' }))).toBe(true);
  });

  // отзыв токена должен действовать сразу, без перезапуска процесса
  it('отозванный токен перестаёт работать немедленно', async () => {
    expect(await isRejected(await listBases({ authorization: 'Bearer tok-alice-secret' }))).toBe(false);
    process.env.MCP_TOKENS = `tok-bob-secret:${BOB}`;
    expect(await isRejected(await listBases({ authorization: 'Bearer tok-alice-secret' }))).toBe(true);
  });

  // схема Bearer пишется клиентами по-разному
  it('регистр схемы Bearer не ломает вход своему токену', async () => {
    expect(await isRejected(await listBases({ authorization: 'bearer tok-alice-secret' }))).toBe(false);
    expect(await isRejected(await listBases({ authorization: 'BEARER tok-alice-secret' }))).toBe(false);
  });

  // чужая схема авторизации не должна проходить
  it('Basic-заголовок с телом токена не принимается', async () => {
    expect(await isRejected(await listBases({ authorization: 'Basic tok-alice-secret' }))).toBe(true);
  });

  // мусор в теле запроса не должен превращаться в успешный вызов
  it('битый JSON отвечает ошибкой разбора, а не выполняет инструмент', async () => {
    const res = await POST(new Request('http://localhost/api/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer tok-alice-secret' }, body: '{не json',
    }));
    expect((await res.json()).error?.code).toBe(-32700);
  });

  // тело не-JSON типа
  it('текстовое тело не выполняет инструмент', async () => {
    const res = await POST(new Request('http://localhost/api/mcp', {
      method: 'POST', headers: { 'Content-Type': 'text/plain', authorization: 'Bearer tok-alice-secret' }, body: 'list_bases',
    }));
    expect((await res.json()).error?.code).toBe(-32700);
  });
});

describe('MCP — токен в строке запроса', () => {
  // задокументированный компромисс: клиенты без своих заголовков шлют ?token=.
  // Фиксируем, что это работает, и одновременно — что чужой ?token= не работает.
  it('свой ?token= работает, чужой мусор — нет', async () => {
    expect(await isRejected(await listBases({}, 'http://localhost/api/mcp?token=tok-alice-secret'))).toBe(false);
    expect(await isRejected(await listBases({}, 'http://localhost/api/mcp?token=подобрал'))).toBe(true);
  });

  // заголовок должен быть главнее строки запроса: иначе чужая ссылка с ?token=
  // в адресе подменит того, от чьего имени идёт вызов
  it('заголовок имеет приоритет над ?token=', async () => {
    const res = await listBases({ authorization: 'Bearer tok-alice-secret' }, 'http://localhost/api/mcp?token=tok-bob-secret');
    const body = await res.json();
    expect(body?.error?.code).toBeUndefined();
  });
});

describe('MCP — что видно без токена', () => {
  // неавторизованный GET не должен превращаться в справочник по внутренней поверхности
  it('GET без токена не перечисляет инструменты сервера', async () => {
    const res = await GET(new Request('http://localhost/api/mcp'));
    const body = await res.json();
    expect(body.authorized).toBe(false);
    expect(body.user).toBeNull();
    expect(body.tools).toBeUndefined();
  });

  // GET с чужим токеном не должен подтверждать, что токен чей-то
  it('GET с неизвестным токеном не выдаёт ничьей почты', async () => {
    const res = await GET(new Request('http://localhost/api/mcp?token=не-тот'));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(ALICE);
    expect(text).not.toContain(BOB);
  });

  // initialize намеренно открыт (рукопожатие), но не должен раздавать секреты
  it('initialize без токена не содержит ни одного токена из MCP_TOKENS', async () => {
    const res = await rpc({}, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('tok-alice-secret');
    expect(text).not.toContain('tok-bob-secret');
  });
});

describe('MCP_TOKENS — разбор конфигурации', () => {
  // токен, внутри которого оказалось двоеточие, не должен молча укорачиваться:
  // тогда рабочим ключом станет его первая часть, короче и слабее заявленного
  it('двоеточие внутри токена не создаёт укороченный рабочий ключ', () => {
    process.env.MCP_TOKENS = 'ab:cd:alice@example.com';
    expect(emailForToken('ab')).toBeNull();
  });

  // пустые и мусорные записи не должны порождать «токен-пустышку»
  it('мусорные записи не создают валидных токенов', () => {
    expect(parseTokens(',,:  ,x:,:y, ')).toEqual([]);
    expect(emailForToken(null)).toBeNull();
  });

  // пробелы вокруг записи в env — обычная опечатка при вставке
  it('пробелы вокруг токена в env не превращаются в другой токен', () => {
    process.env.MCP_TOKENS = ' tok-x : alice@example.com ';
    expect(emailForToken('tok-x')).toBe('alice@example.com');
    expect(emailForToken(' tok-x ')).toBeNull();
  });
});
