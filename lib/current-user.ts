import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Почта вошедшего — по ней разделяются базы: человек видит свои и общие.
// Локально без настроенной авторизации возвращаем фиктивную почту, иначе
// разработка превратится в постоянные 401.
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
        /* роуты только читают сессию */
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}
