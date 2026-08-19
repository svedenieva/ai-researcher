// Per-record system flag: is this row still a draft being researched, or a
// checked/verified one. Stored under a reserved key in the record's data so it
// lives on every record, in every base, and can't be deleted like a normal
// column. Default for a new record is "draft".
export const MODE_KEY = '__mode';
export const MODE_RESEARCH = 'Черновик';
export const MODE_REFERENCE = 'Проверено';
export const MODE_VALUES = [MODE_RESEARCH, MODE_REFERENCE] as const;

// Values written before the rename — still present in stored records, so they
// are mapped onto the current pair instead of being treated as unknown.
const LEGACY_REFERENCE = 'Эталон';

export type RecordMode = typeof MODE_RESEARCH | typeof MODE_REFERENCE;

// The mode of a record, defaulting to "draft" when the flag is absent
// (old rows, built-in catalog rows).
export function recordMode(r: Record<string, unknown>): RecordMode {
  const v = r[MODE_KEY];
  return v === MODE_REFERENCE || v === LEGACY_REFERENCE ? MODE_REFERENCE : MODE_RESEARCH;
}
