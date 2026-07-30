import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAllowed } from '@/lib/supabase-auth';

// Access control, in order of preference:
//   1. If Supabase auth is configured (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY),
//      require a Google sign-in whose email passes isAllowed().
//   2. Else, if SITE_PASSWORD is set, require that password (Basic Auth).
//   3. Else (local dev), the site is open.
const PUBLIC_PATHS = ['/login', '/auth/callback'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // ── 1. Google auth via Supabase ──
  if (supabaseUrl && anonKey) {
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

  // ── 2. Fallback: site-wide password (Basic Auth) ──
  const password = process.env.SITE_PASSWORD;
  if (password) {
    const auth = request.headers.get('authorization');
    if (auth?.startsWith('Basic ')) {
      try {
        const decoded = atob(auth.slice(6));
        const given = decoded.slice(decoded.indexOf(':') + 1);
        if (given === password) return NextResponse.next();
      } catch {
        // fall through
      }
    }
    return new NextResponse('Требуется пароль', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="AI-Researcher"' },
    });
  }

  // ── 3. Open (local dev) ──
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
