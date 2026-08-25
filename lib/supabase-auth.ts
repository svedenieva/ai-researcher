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
  // No email is never allowed, even with an empty list: the whole app keys data
  // by email, and owner === null means "a base visible to everyone".
  const raw = email ?? '';
  if (!raw.trim()) return false;
  // Compare untrimmed on purpose — a padded address like "  boss@x  " must fail.
  const value = raw.toLowerCase();
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(value);
}

export function createClientForBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
