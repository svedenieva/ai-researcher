import { unzipSync, zipSync } from 'fflate';
import { isJunk, isSafePath } from './site';

// Working with the archive. The same module works both in the browser (unpack the
// chosen .zip before upload) and on the server (repack the site back into a .zip) —
// fflate is synchronous and doesn't drag in Node APIs.

export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

// Unpacking: folder entries and archiver junk are dropped right away, so only real
// files flow further down the pipeline.
export function unzipEntries(archive: Uint8Array): ZipEntry[] {
  const out: ZipEntry[] = [];
  const files = unzipSync(archive);
  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith('/') || isJunk(path)) continue;
    // zip-slip: an entry named ../../etc/x escapes wherever it is written. The
    // server's validateUpload catches it today, but this function is exported
    // and already called server-side — the next caller won't have that cover.
    if (!isSafePath(path)) continue;
    out.push({ path, bytes });
  }
  return out;
}

export function zipEntries(entries: ZipEntry[]): Uint8Array {
  const map: Record<string, Uint8Array> = {};
  for (const e of entries) map[e.path] = e.bytes;
  return zipSync(map);
}
