import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Email of the signed-in user — bases are partitioned by it: a person sees their
// own and the shared ones. Locally, with no auth configured, we return a dummy
// email, otherwise development turns into constant 401s.
export async function currentEmail(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // No auth configured: a dummy email locally so dev isn't a wall of 401s — but
  // on a real deployment (Vercel) a missing key must FAIL CLOSED, not silently
  // make every caller 'local@dev' and hand them the ownerless shared bases.
  if (!url || !anon) return process.env.VERCEL ? null : 'local@dev';

  const store = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll() {
        /* routes only read the session */
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}
