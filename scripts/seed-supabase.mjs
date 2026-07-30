// Load the local catalog into the Supabase `products` table.
// Run: node --env-file=.env.local scripts/seed-supabase.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (use --env-file=.env.local)');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });
const rows = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const payload = rows.map((r) => ({ id: r.id, data: r }));

const CHUNK = 500;
let done = 0;
for (let i = 0; i < payload.length; i += CHUNK) {
  const slice = payload.slice(i, i + CHUNK);
  const { error } = await client.from('products').upsert(slice, { onConflict: 'id' });
  if (error) {
    console.error('Upsert failed:', error.message);
    process.exit(1);
  }
  done += slice.length;
  console.log(`upserted ${done}/${payload.length}`);
}
console.log(`Done: ${done} products in Supabase.`);
