import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

// Избранные источники: пометка записи звёздочкой. Хранится на пользователя
// (email из сессии), поэтому избранное едет за человеком между устройствами.
// Таблица: favorites (user_email, base_id, record_id).

export const dynamic = 'force-dynamic';

async function currentEmail(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return 'local@dev'; // локальная разработка без авторизации
  const store = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll() {
        /* роут только читает сессию */
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request): Promise<Response> {
  const base = new URL(request.url).searchParams.get('base') ?? '';
  const email = await currentEmail();
  const db = admin();
  if (!email || !db) return Response.json({ favorites: [] });
  const { data, error } = await db
    .from('favorites')
    .select('record_id')
    .eq('user_email', email)
    .eq('base_id', base);
  if (error) {
    console.error('favorites read failed:', error.message);
    return Response.json({ favorites: [] });
  }
  return Response.json({ favorites: (data ?? []).map((r) => (r as { record_id: string }).record_id) });
}

// переключить звезду
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown; record?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const base = String(body?.base ?? '');
  const record = String(body?.record ?? '');
  if (!base || !record) return Response.json({ error: 'Нужны base и record' }, { status: 400 });

  const email = await currentEmail();
  const db = admin();
  if (!email || !db) return Response.json({ error: 'Нет доступа' }, { status: 401 });

  const { data: existing } = await db
    .from('favorites')
    .select('id')
    .eq('user_email', email)
    .eq('base_id', base)
    .eq('record_id', record)
    .maybeSingle();

  if (existing) {
    const { error } = await db.from('favorites').delete().eq('id', (existing as { id: string }).id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ favorite: false });
  }
  const { error } = await db
    .from('favorites')
    .insert({ user_email: email, base_id: base, record_id: record });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ favorite: true });
}
