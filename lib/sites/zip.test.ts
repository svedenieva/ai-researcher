import { describe, it, expect } from 'vitest';
import { unzipEntries, zipEntries } from './zip';
import { validateUpload } from './site';

const enc = new TextEncoder();
const dec = new TextDecoder();

describe('zip round-trip', () => {
  it('gives back the same files after zip → unzip', () => {
    const site = [
      { path: 'index.html', bytes: enc.encode('<link rel="stylesheet" href="style.css">Привет') },
      { path: 'style.css', bytes: enc.encode('body{margin:0}') },
      { path: 'assets/logo.svg', bytes: enc.encode('<svg/>') },
    ];

    const back = unzipEntries(zipEntries(site));

    expect(back.map((e) => e.path).sort()).toEqual(['assets/logo.svg', 'index.html', 'style.css']);
    for (const original of site) {
      const found = back.find((e) => e.path === original.path);
      expect(found).toBeDefined();
      expect(dec.decode(found!.bytes)).toBe(dec.decode(original.bytes));
    }
  });

  it('survives binary content untouched', () => {
    const bytes = new Uint8Array([0, 255, 13, 10, 26, 137, 80, 78, 71]);
    const [back] = unzipEntries(zipEntries([{ path: 'logo.png', bytes }]));
    expect(Array.from(back.bytes)).toEqual(Array.from(bytes));
  });

  it('drops folder records and archiver junk on the way out', () => {
    const archive = zipEntries([
      { path: '__MACOSX/._index.html', bytes: enc.encode('junk') },
      { path: 'my-site/index.html', bytes: enc.encode('<h1>hi</h1>') },
      { path: 'my-site/.DS_Store', bytes: enc.encode('junk') },
    ]);
    expect(unzipEntries(archive).map((e) => e.path)).toEqual(['my-site/index.html']);
  });

  it('an unzipped archive passes validation as an uploadable site', () => {
    const archive = zipEntries([
      { path: 'my-site/index.html', bytes: enc.encode('<h1>hi</h1>') },
      { path: 'my-site/style.css', bytes: enc.encode('body{}') },
    ]);
    const entries = unzipEntries(archive);
    const res = validateUpload(entries.map((e) => ({ path: e.path, size: e.bytes.length })));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // the my-site wrapper is stripped, the entry page is found
    expect(res.value.entry).toBe('index.html');
    expect(res.value.files.map((f) => f.path)).toEqual(['index.html', 'style.css']);
  });
});
