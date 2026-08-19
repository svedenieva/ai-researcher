// Per-record system flag: is this row part of the research, or a reference
// ("эталон") sample. Stored under a reserved key in the record's data so it
// lives on every record, in every base, and can't be deleted like a normal
// column. Default for a new record is "research".
export const MODE_KEY = '__mode';
export const MODE_RESEARCH = 'Исследование';
export const MODE_REFERENCE = 'Эталон';
export const MODE_VALUES = [MODE_RESEARCH, MODE_REFERENCE] as const;

export type RecordMode = typeof MODE_RESEARCH | typeof MODE_REFERENCE;

// The mode of a record, defaulting to "research" when the flag is absent
// (old rows, built-in catalog rows).
export function recordMode(r: Record<string, unknown>): RecordMode {
  return r[MODE_KEY] === MODE_REFERENCE ? MODE_REFERENCE : MODE_RESEARCH;
}
