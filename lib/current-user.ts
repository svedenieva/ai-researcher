import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Email of the signed-in user — bases are partitioned by it: a person sees their
// own and the shared ones. Locally, with no auth configured, we return a dummy
// email, otherwise development turns into constant 401s.
export async function currentEmail(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return 'local@dev';

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
