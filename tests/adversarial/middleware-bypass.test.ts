// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Атака на калитку. Всё, что не в PUBLIC_PATHS, обязано уводить неавторизованного
// на /login. Проверяем не «работает ли вход», а можно ли пролезть МИМО него.

const state = vi.hoisted(() => ({ user: null as { email?: string } | null }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}));

import { middleware, config } from '@/middleware';

const env = { ...process.env };

beforeEach(() => {
  state.user = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.ALLOWED_EMAILS;
  delete process.env.VERCEL;
});
afterEach(() => {
  process.env = { ...env };
});

const run = (url: string) => middleware(new NextRequest(new Request(url)));
const redirectedToLogin = (res: Response) =>
  res.status === 307 && (res.headers.get('location') ?? '').endsWith('/login');

describe('middleware — базовое поведение калитки', () => {
  // если это сломается, закрытые данные раздаются без входа
  it('неавторизованного с закрытого пути уводит на /login', async () => {
    expect(redirectedToLogin(await run('http://localhost/api/bases'))).toBe(true);
  });

  // если это сломается, MCP-клиент вместо ответа получит HTML страницы входа
  it('/api/mcp остаётся публичным — он проверяет личный токен сам', async () => {
    expect(redirectedToLogin(await run('http://localhost/api/mcp'))).toBe(false);
  });

  // если это сломается, вход в систему пускает того, кого не должен
  it('вошедший, но не из списка ALLOWED_EMAILS, всё равно уходит на /login', async () => {
    process.env.ALLOWED_EMAILS = 'boss@aivocado.com';
    state.user = { email: 'stranger@evil.com' };
    expect(redirectedToLogin(await run('http://localhost/api/bases'))).toBe(true);
  });
});

describe('middleware — обход по префиксу', () => {
  // PUBLIC_PATHS сверяется через startsWith: любой БУДУЩИЙ путь, начинающийся
  // на «/api/mcp», окажется без авторизации, даже если он к MCP не относится
  it('путь «/api/mcp-evil» не должен считаться публичным', async () => {
    expect(redirectedToLogin(await run('http://localhost/api/mcp-evil'))).toBe(true);
  });

  // то же самое с «/login»: «/loginXXX» — другой путь, а калитка его пропускает
  it('путь «/loginXXX» не должен считаться публичным', async () => {
    expect(redirectedToLogin(await run('http://localhost/loginXXX'))).toBe(true);
  });

  // «/.well-known/» открыт целиком по префиксу — сосед по имени тоже открыт
  it('путь «/.well-known-secrets» не должен считаться публичным', async () => {
    expect(redirectedToLogin(await run('http://localhost/.well-known-secrets'))).toBe(true);
  });

  // публичные пути обязаны оставаться публичными вместе с их подпутями
  it('«/api/mcp/» и «/.well-known/x» остаются публичными', async () => {
    expect(redirectedToLogin(await run('http://localhost/api/mcp/'))).toBe(false);
    expect(redirectedToLogin(await run('http://localhost/.well-known/oauth'))).toBe(false);
  });
});

describe('middleware — трюки с путём', () => {
  // «..» в адресе не должно выводить из-под защиты
  it('«/api/mcp/../bases» нормализуется и остаётся закрытым', async () => {
    expect(redirectedToLogin(await run('http://localhost/api/mcp/../bases'))).toBe(true);
  });

  // кодированный слэш не нормализуется браузером — путь не должен внезапно стать публичным
  it('«/api%2fmcp» не проходит как публичный', async () => {
    expect(redirectedToLogin(await run('http://localhost/api%2fmcp'))).toBe(true);
  });

  // регистр: маршруты Next регистрозависимы, калитка обязана быть не мягче
  it('«/API/MCP» не проходит как публичный', async () => {
    expect(redirectedToLogin(await run('http://localhost/API/MCP'))).toBe(true);
  });

  // двойное кодирование
  it('«/%2e%2e/api/bases» остаётся закрытым', async () => {
    expect(redirectedToLogin(await run('http://localhost/%2e%2e/api/bases'))).toBe(true);
  });
});

describe('middleware — заглушки OAuth и ненастроенный Supabase', () => {
  // заглушки обязаны отвечать «нет такого», иначе MCP-клиент уходит в несуществующий OAuth
  it('/register, /authorize, /token отвечают 404 и не раскрывают ничего лишнего', async () => {
    for (const p of ['/register', '/authorize', '/token']) {
      const res = await run(`http://localhost${p}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('oauth_not_supported');
      expect(JSON.stringify(body)).not.toContain('anon-key');
    }
  });

  // на деплое без ключей нельзя открывать данные — только глухая стена
  it('без Supabase на VERCEL отдаёт 503, а не открытый доступ', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.VERCEL = '1';
    const res = await run('http://localhost/api/bases');
    expect(res.status).toBe(503);
  });

  // тот же fail-closed должен работать и для заглушек, и для /api/mcp
  it('без Supabase на VERCEL /api/mcp тоже не открыт нараспашку', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.VERCEL = '1';
    expect((await run('http://localhost/api/mcp')).status).toBe(503);
  });
});

describe('middleware — matcher', () => {
  // matcher вырезает часть путей ДО проверки: слишком широкое исключение = дыра
  it('из-под middleware исключены только статика и favicon', async () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    // эти обязаны попадать под middleware
    for (const p of ['/api/bases', '/_next/data/x.json', '/_nextfoo', '/bin']) {
      expect({ path: p, guarded: re.test(p) }).toEqual({ path: p, guarded: true });
    }
    // а эти — законно вне его
    for (const p of ['/_next/static/chunk.js', '/favicon.ico']) {
      expect({ path: p, guarded: re.test(p) }).toEqual({ path: p, guarded: false });
    }
  });
});
