import { describe, it, expect } from 'vitest';
import {
  contentTypeFor,
  isSafePath,
  pickEntry,
  slugId,
  stripCommonPrefix,
  validateUpload,
  MAX_FILES,
} from './site';

const f = (path: string, size = 100) => ({ path, size });

describe('slugId', () => {
  it('makes a url-safe slug from the name', () => {
    expect(slugId('  Spaces  &  Symbols!  ', new Set())).toBe('spaces-symbols');
  });

  it('transliterates cyrillic, because a storage key may not hold it', () => {
    expect(slugId('Лендинг для Ромашки', new Set())).toBe('lending-dlya-romashki');
    expect(slugId('Щёлочь и Ёж', new Set())).toBe('scheloch-i-ezh');
  });

  it('never produces a key Supabase Storage would reject', () => {
    for (const name of ['Демо-сайт проверки', 'Ёжик & Ко!', 'Сайт «Ромашка» №1', '日本語']) {
      expect(slugId(name, new Set())).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('suffixes on collision instead of overwriting', () => {
    const taken = new Set(['lending']);
    expect(slugId('Лендинг', taken)).toBe('lending-2');
    taken.add('lending-2');
    expect(slugId('Лендинг', taken)).toBe('lending-3');
  });

  it('falls back to a default when the name has nothing slug-able', () => {
    expect(slugId('!!!', new Set())).toBe('site');
    expect(slugId('!!!', new Set(['site']))).toBe('site-2');
  });
});

describe('stripCommonPrefix', () => {
  it('drops the wrapping folder every file shares', () => {
    expect(stripCommonPrefix(['my-site/index.html', 'my-site/css/style.css'])).toEqual([
      'index.html',
      'css/style.css',
    ]);
  });

  it('keeps paths untouched when files already sit at the root', () => {
    expect(stripCommonPrefix(['index.html', 'css/style.css'])).toEqual(['index.html', 'css/style.css']);
  });

  it('keeps paths when the top level holds more than one folder', () => {
    const paths = ['a/index.html', 'b/style.css'];
    expect(stripCommonPrefix(paths)).toEqual(paths);
  });

  it('ignores archiver junk when looking for the wrapper', () => {
    expect(
      stripCommonPrefix(['__MACOSX/._index.html', 'my-site/index.html', 'my-site/.DS_Store']),
    ).toEqual(['index.html']);
  });

  it('strips only one level', () => {
    expect(stripCommonPrefix(['site/dist/index.html', 'site/dist/app.js'])).toEqual([
      'dist/index.html',
      'dist/app.js',
    ]);
  });
});

describe('pickEntry', () => {
  it('prefers index.html at the root', () => {
    expect(pickEntry(['index.html', 'about.html'])).toBe('index.html');
  });

  it('uses the single html file when there is no index at the root', () => {
    expect(pickEntry(['pages/landing.html', 'style.css'])).toBe('pages/landing.html');
  });

  it('refuses to guess between several html files', () => {
    expect(pickEntry(['a.html', 'b.html'])).toBeNull();
  });

  it('returns null when there is no html at all', () => {
    expect(pickEntry(['style.css', 'logo.png'])).toBeNull();
  });
});

describe('isSafePath', () => {
  it('rejects paths that climb out of the site folder', () => {
    expect(isSafePath('../secrets.env')).toBe(false);
    expect(isSafePath('assets/../../etc/passwd')).toBe(false);
    expect(isSafePath('/absolute.html')).toBe(false);
    expect(isSafePath('windows\\style.css')).toBe(false);
  });

  it('accepts ordinary relative paths', () => {
    expect(isSafePath('index.html')).toBe(true);
    expect(isSafePath('assets/img/logo.png')).toBe(true);
  });
});

describe('validateUpload', () => {
  it('accepts a plain site and reports entry and total size', () => {
    const res = validateUpload([f('index.html', 1200), f('style.css', 300)]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.entry).toBe('index.html');
    expect(res.value.sizeBytes).toBe(1500);
    expect(res.value.files.map((x) => x.path)).toEqual(['index.html', 'style.css']);
  });

  it('strips the wrapper before validating, so a zipped folder passes', () => {
    const res = validateUpload([f('my-site/index.html'), f('my-site/app.js')]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.entry).toBe('index.html');
  });

  it('rejects a file over 10 MB and names it', () => {
    const res = validateUpload([f('index.html'), f('video.mp4', 11 * 1024 * 1024)]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('video.mp4');
    expect(res.error).toContain('10 МБ');
  });

  it('rejects more than the file-count limit', () => {
    const many = [f('index.html'), ...Array.from({ length: MAX_FILES }, (_, i) => f(`f${i}.png`))];
    const res = validateUpload(many);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain(String(MAX_FILES));
  });

  it('rejects an upload with no html to open', () => {
    const res = validateUpload([f('style.css'), f('logo.png')]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('index.html');
  });

  it('rejects an empty upload', () => {
    expect(validateUpload([]).ok).toBe(false);
    // папки без файлов тоже пусты
    expect(validateUpload([f('assets/')]).ok).toBe(false);
  });

  it('keeps sizes aligned with paths after junk is dropped', () => {
    const res = validateUpload([f('__MACOSX/._x', 9), f('site/index.html', 10), f('site/a.css', 20)]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.files).toEqual([
      { path: 'index.html', size: 10 },
      { path: 'a.css', size: 20 },
    ]);
  });
});

describe('contentTypeFor', () => {
  it('resolves the types a static site actually ships', () => {
    expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('css/style.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('app.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('data.json')).toBe('application/json; charset=utf-8');
    expect(contentTypeFor('logo.svg')).toBe('image/svg+xml');
    expect(contentTypeFor('photo.JPG')).toBe('image/jpeg');
    expect(contentTypeFor('font.woff2')).toBe('font/woff2');
    expect(contentTypeFor('clip.mp4')).toBe('video/mp4');
  });

  it('falls back to a neutral type for anything unknown', () => {
    expect(contentTypeFor('archive.bin')).toBe('application/octet-stream');
    expect(contentTypeFor('LICENSE')).toBe('application/octet-stream');
  });
});
