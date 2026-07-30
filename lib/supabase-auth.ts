import { createBrowserClient } from '@supabase/ssr';

// True when Supabase auth is configured (public URL + anon key present).
export function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Email allow-list. Empty list = any signed-in Google account is allowed;
// set ALLOWED_EMAILS="a@x.com,b@y.com" to restrict to specific people.
export function isAllowed(email?: string | null): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes((email ?? '').toLowerCase());
}

export function createClientForBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
