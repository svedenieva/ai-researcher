// Honest cell coercion for a column type change (§5.2, from the table-systems
// survey). Only «→ number» actually rewrites stored values, because that's the
// one change that affects behaviour (sorting, group totals). Every other target
// type interprets the stored string at render time, so it needs no rewrite and
// loses nothing. A value that won't parse as a number is kept exactly as it was
// — the grid warns in advance how many won't fit; it never drops them.

export function coerceToNumber(v: unknown): unknown {
  if (v === null || v === undefined || typeof v === 'number') return v;
  const s = String(v);
  if (s.trim() === '') return v;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : v;
}
