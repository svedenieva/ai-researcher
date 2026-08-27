import { createClient } from '@supabase/supabase-js';
import { currentEmail } from '@/lib/current-user';

// Favorite sources: starring a record. Stored per user (email from the
// session), so favorites follow the person across devices.
// Table: favorites (user_email, base_id, record_id).
//
// The signed-in email comes from the shared lib/current-user helper — one place
// to fix, so an auth change (null-owner guards, the dev fallback) can't drift
// between here and everywhere else.

export const dynamic = 'force-dynamic';

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

// toggle the star
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown; record?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed request' }, { status: 400 });
  }
  const base = String(body?.base ?? '');
  const record = String(body?.record ?? '');
  if (!base || !record) return Response.json({ error: 'base and record are required' }, { status: 400 });

  const email = await currentEmail();
  const db = admin();
  if (!email || !db) return Response.json({ error: 'No access' }, { status: 401 });

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
