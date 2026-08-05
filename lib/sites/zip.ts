import { unzipSync, zipSync } from 'fflate';
import { isJunk } from './site';

// Работа с архивом. Один и тот же модуль работает и в браузере (распаковать
// выбранный .zip перед загрузкой), и на сервере (собрать сайт обратно в .zip) —
// fflate синхронный и не тянет за собой Node-API.

export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

// Распаковка: записи папок и мусор архиваторов выкидываем сразу, чтобы дальше
// по конвейеру шли только настоящие файлы.
export function unzipEntries(archive: Uint8Array): ZipEntry[] {
  const out: ZipEntry[] = [];
  const files = unzipSync(archive);
  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith('/') || isJunk(path)) continue;
    out.push({ path, bytes });
  }
  return out;
}

export function zipEntries(entries: ZipEntry[]): Uint8Array {
  const map: Record<string, Uint8Array> = {};
  for (const e of entries) map[e.path] = e.bytes;
  return zipSync(map);
}
