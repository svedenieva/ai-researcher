// Parsing an uploaded site: slug, trimming the common folder, picking the start
// page, checks, and content-type. All pure — no Supabase and no browser, so it
// works the same in the upload form, in routes, and in tests.

/** a site file: path relative to the site root and size in bytes */
export interface SiteFile {
  path: string;
  size: number;
}

export interface SiteMeta {
  id: string;
  name: string;
  client: string | null;
  tags: string[];
  note: string | null;
  entry: string;
  fileCount: number;
  sizeBytes: number;
  owner: string | null;
  createdAt: string;
  // the manifest agreed at upload time — the per-file upload route checks
  // every path against it, so a legacy row without one has nothing to accept
  files: SiteFile[];
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 200;
// Per-file and per-count ceilings existed; the sum did not, so 200 files of
// exactly 10 MB each passed as 2 GB in one upload.
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

const RU_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ye',
  ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h',
  ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

// url-safe slug from the name. Unlike knowledge bases, where the id stays
// Cyrillic, here it's also the object key in Storage — and that accepts only
// Latin letters, digits, and a little punctuation, and to «демо-сайт/index.html»
// it replies «Invalid key». So we transliterate Russian names.
export function slugId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[а-яёіїєґ]/g, (ch) => RU_LAT[ch] ?? '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 32)
      .replace(/-$/, '') || 'site';
  let id = base;
  let n = 1;
  while (taken.has(id)) id = `${base}-${++n}`;
  return id;
}

// Archiver and system junk. It ends up in the zip on its own, but the common
// folder can't be found with it around — because of a single __MACOSX/ the prefix
// trim would stop working, and a site with index.html inside a folder would be
// rejected with "no index.html".
export function isJunk(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((p) => p === '__MACOSX' || p === '.DS_Store' || p === 'Thumbs.db')) return true;
  // empty segments = a folder entry, not a file
  return parts.some((p) => p === '') || path.trim() === '';
}

// The path must not escape its own site: the storage key is glued as <id>/<path>,
// and '..' would take the entry into someone else's folder.
export function isSafePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false;
  return !path.split('/').some((p) => p === '..' || p === '.' || p === '');
}

// An archive is usually wrapped in a single folder: my-site/index.html. Inside the
// site the links are relative, so we trim the wrapper — otherwise the site would
// land one level lower than its own markup expects. We trim exactly one level.
export function stripCommonPrefix(paths: string[]): string[] {
  const clean = paths.filter((p) => !isJunk(p));
  if (clean.length === 0) return [];
  const first = clean[0].split('/')[0];
  // there's a common folder only if EVERY path is inside it
  const wrapped = clean.every((p) => {
    const parts = p.split('/');
    return parts.length > 1 && parts[0] === first;
  });
  return wrapped ? clean.map((p) => p.slice(first.length + 1)) : clean;
}

// Start page: index.html at the root, otherwise the single html if there's
// exactly one in the set. We don't resolve the ambiguity ("which of the three
// htmls is the main one?") ourselves — let the person rename it.
export function pickEntry(paths: string[]): string | null {
  if (paths.includes('index.html')) return 'index.html';
  const html = paths.filter((p) => /\.html?$/i.test(p));
  return html.length === 1 ? html[0] : null;
}

export interface UploadCheck {
  files: SiteFile[];
  entry: string;
  sizeBytes: number;
}

// Checks before writing: a heavy file, too many files, nothing to show. We return
// the error text — that same text is shown to the person, without codes or dictionaries.
export function validateUpload(input: SiteFile[]): { ok: true; value: UploadCheck } | { ok: false; error: string } {
  // first drop the junk, then trim the wrapper — this preserves the order and the
  // new paths line up with their own sizes
  const kept = input.filter((f) => !isJunk(f.path));
  // check the paths as uploaded, before the wrapper folder is trimmed: a set
  // that all starts with '..' looks "wrapped" to stripCommonPrefix, which then
  // silently rewrites the intent instead of refusing it
  const rawUnsafe = kept.find((f) => !isSafePath(f.path));
  if (rawUnsafe) return { ok: false, error: `Недопустимый путь: «${rawUnsafe.path}»` };

  const paths = stripCommonPrefix(kept.map((f) => f.path));
  const files: SiteFile[] = kept.map((f, i) => ({ path: paths[i], size: f.size }));

  if (files.length === 0) return { ok: false, error: 'В загрузке нет файлов' };
  if (files.length > MAX_FILES) {
    return { ok: false, error: `Слишком много файлов: ${files.length}. Максимум ${MAX_FILES}` };
  }
  const heavy = files.find((f) => f.size > MAX_FILE_BYTES);
  if (heavy) {
    const mb = (heavy.size / 1024 / 1024).toFixed(1);
    return { ok: false, error: `Файл «${heavy.path}» весит ${mb} МБ — больше 10 МБ` };
  }
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    const mb = (total / 1024 / 1024).toFixed(0);
    return { ok: false, error: `Сайт весит ${mb} МБ — больше ${MAX_TOTAL_BYTES / 1024 / 1024} МБ` };
  }

  const entry = pickEntry(files.map((f) => f.path));
  if (!entry) {
    return { ok: false, error: 'Нет index.html в корне сайта — непонятно, что открывать' };
  }
  return { ok: true, value: { files, entry, sizeBytes: files.reduce((s, f) => s + f.size, 0) } };
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff',
  mp4: 'video/mp4',
  txt: 'text/plain; charset=utf-8',
};

// We set the type by extension: the browser won't execute css as html, and
// nosniff in the route won't let it guess on its own.
export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

// Response doesn't accept a Uint8Array by type (BodyInit expects an ArrayBuffer or
// Blob), so we return a buffer exactly the length of the data — with no tail that
// could remain from a reused buffer.
export function bodyFrom(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
