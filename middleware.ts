import { NextResponse, type NextRequest } from 'next/server';

// Simple site-wide password (HTTP Basic Auth). Set SITE_PASSWORD in the
// deployment env to turn it on; when unset (local dev) the site is open.
// Username can be anything; the password must match SITE_PASSWORD.
export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const given = decoded.slice(decoded.indexOf(':') + 1);
      if (given === password) return NextResponse.next();
    } catch {
      // fall through to the 401
    }
  }

  return new NextResponse('Требуется пароль', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="AI-Researcher"' },
  });
}

// Guard everything except Next's static assets and the favicon.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
