import { describe, it, expect } from 'vitest';
import { TAGS_KEY, TAGS_COLUMN, splitTags, withTagsColumn } from './tags';

describe('splitTags', () => {
  it('splits a comma-separated string, trims, drops empties, dedupes, keeps order', () => {
    expect(splitTags('ai, tooling')).toEqual(['ai', 'tooling']);
    expect(splitTags('ai,tooling')).toEqual(['ai', 'tooling']);
    expect(splitTags(' ai ,, tooling ,ai ')).toEqual(['ai', 'tooling']);
  });
  it('is empty for blank / null / undefined', () => {
    expect(splitTags('')).toEqual([]);
    expect(splitTags(null)).toEqual([]);
    expect(splitTags(undefined)).toEqual([]);
    expect(splitTags(' , , ')).toEqual([]);
  });
  it('accepts an array defensively', () => {
    expect(splitTags(['a', ' b ', 'a'])).toEqual(['a', 'b']);
  });
});

describe('TAGS_COLUMN', () => {
  it('is a filterable multiselect system column', () => {
    expect(TAGS_COLUMN.key).toBe(TAGS_KEY);
    expect(TAGS_KEY).toBe('__tags');
    expect(TAGS_COLUMN.type).toBe('multiselect');
    expect(TAGS_COLUMN.filterable).toBe(true);
  });
});

describe('withTagsColumn', () => {
  it('injects the tags column right after the name column, once', () => {
    const cols = [
      { key: 'название', label: 'Название', type: 'text' as const },
      { key: 'цена', label: 'Цена', type: 'text' as const },
    ];
    const out = withTagsColumn(cols);
    expect(out.map((c) => c.key)).toEqual(['название', TAGS_KEY, 'цена']);
    // idempotent: an existing tags column isn't duplicated
    expect(withTagsColumn(out).filter((c) => c.key === TAGS_KEY)).toHaveLength(1);
  });
  it('leaves an empty column list alone', () => {
    expect(withTagsColumn([])).toEqual([]);
  });
});
