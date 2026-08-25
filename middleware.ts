import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAllowed } from '@/lib/supabase-auth';

// Google sign-in via Supabase.
//   - Configured (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY): require a Google login
//     whose email passes isAllowed().
//   - Not configured on a deployment (VERCEL): fail closed (no open data).
//   - Not configured locally: open, for development.
// /api/mcp checks its own personal token, so it needs no session: otherwise
// an external client would get a redirect to the sign-in page instead of an answer.
//
// /.well-known/ is here for the same reason but with a different consequence.
// Before connecting, an MCP client looks for an authorization description
// (oauth-protected-resource and friends). We have no OAuth of our own -
// authorization is by personal token - so the correct answer at those paths is
// "no such thing", i.e. 404. Behind the middleware they answered 307 to /login,
// and a client reads that redirect as "the server does want OAuth after all",
// then goes off to perform an exchange that does not exist instead of simply
// using its token. Nothing secret is served at those paths.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/mcp', '/.well-known/'];

// Having found no description under /.well-known/, an MCP client falls back to
// the default OAuth paths - /register, /authorize, /token at the root. Behind the
// blanket guard those answered with a redirect to /login - a real Google sign-in
// page - and the client reported "couldn't register with sign-in service": it
// concluded a sign-in service exists and registration merely failed. The right
// answer here is "not supported", so the client drops OAuth and uses its token.
const OAUTH_STUBS = ['/register', '/authorize', '/token'];

// A public path matches only itself and its sub-paths — never a mere prefix.
// Plain startsWith let "/loginXXX" and "/api/mcp-evil" through the gate: any
// future route sharing a prefix would silently become unauthenticated.
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) =>
    p.endsWith('/') ? pathname === p || pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}

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
  const isPublic = isPublicPath(pathname);

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
