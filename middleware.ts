import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAllowed } from '@/lib/supabase-auth';

// Google sign-in via Supabase.
//   - Configured (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY): require a Google login
//     whose email passes isAllowed().
//   - Not configured on a deployment (VERCEL): fail closed (no open data).
//   - Not configured locally: open, for development.
// /api/mcp проверяет личный токен сам, поэтому сессия ему не нужна — иначе
// внешний клиент вместо ответа получал бы редирект на страницу входа.
//
// /.well-known/ здесь по той же причине, но с другим следствием. Клиент MCP
// перед подключением ищет описание авторизации (oauth-protected-resource и
// подобные). Своего OAuth у нас нет — авторизация по личному токену, и
// правильный ответ на эти адреса «нет такого», то есть 404. Под защитой
// middleware они отдавали 307 на /login, а редирект клиент читает как «сервер
// всё-таки просит OAuth» и уходит выполнять несуществующий обмен вместо того,
// чтобы просто использовать токен. Ничего секретного по этим адресам не лежит.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/mcp', '/.well-known/'];

// Не найдя описания в /.well-known/, клиент MCP идёт в адреса OAuth по
// умолчанию — /register, /authorize, /token в корне. Под общей защитой они
// отвечали редиректом на /login, то есть на живую страницу входа Google, и
// клиент докладывал «couldn't register with sign-in service»: он решил, что
// служба входа есть, просто регистрация не удалась. Правильный ответ здесь —
// «не поддерживается», чтобы клиент бросил OAuth и работал по токену.
const OAUTH_STUBS = ['/register', '/authorize', '/token'];

function oauthNotSupported(): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: 'oauth_not_supported', error_description: 'Сервер авторизует по личному токену' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } },
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OAUTH_STUBS.includes(pathname)) return oauthNotSupported();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    if (process.env.VERCEL) {
      return new NextResponse('Авторизация не настроена', { status: 503 });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user && isAllowed(user.email));
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (signedIn && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
