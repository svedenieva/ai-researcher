// Разбор загружаемого сайта: слаг, срез общей папки, выбор стартовой страницы,
// проверки и content-type. Всё чистое — без Supabase и без браузера, поэтому
// одинаково работает и в форме загрузки, и в роутах, и в тестах.

/** файл сайта: путь относительно корня сайта и размер в байтах */
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
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 200;

const RU_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ye',
  ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h',
  ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

// url-безопасный слаг из названия. В отличие от баз знаний, где id остаётся
// кириллическим, здесь он ещё и ключ объекта в Storage — а тот принимает
// только латиницу, цифры и немного пунктуации и на «демо-сайт/index.html»
// отвечает «Invalid key». Поэтому русские названия транслитерируем.
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

// Мусор архиваторов и системы. Попадает в zip сам собой, но общей папки с ним
// не найти — из-за одного __MACOSX/ срез префикса перестал бы срабатывать,
// и сайт с index.html внутри папки был бы отвергнут «нет index.html».
export function isJunk(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((p) => p === '__MACOSX' || p === '.DS_Store' || p === 'Thumbs.db')) return true;
  // пустые сегменты = запись папки, а не файла
  return parts.some((p) => p === '') || path.trim() === '';
}

// Путь не должен вылезать за пределы своего сайта: ключ в хранилище
// склеивается как <id>/<path>, и '..' увёл бы запись в чужую папку.
export function isSafePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false;
  return !path.split('/').some((p) => p === '..' || p === '.' || p === '');
}

// Архив обычно завёрнут в одну папку: my-site/index.html. Внутри сайта ссылки
// относительные, поэтому обёртку срезаем — иначе сайт лёг бы на уровень ниже,
// чем ожидает его собственная вёрстка. Срезаем ровно один уровень.
export function stripCommonPrefix(paths: string[]): string[] {
  const clean = paths.filter((p) => !isJunk(p));
  if (clean.length === 0) return [];
  const first = clean[0].split('/')[0];
  // общая папка есть, только если КАЖДЫЙ путь лежит внутри неё
  const wrapped = clean.every((p) => {
    const parts = p.split('/');
    return parts.length > 1 && parts[0] === first;
  });
  return wrapped ? clean.map((p) => p.slice(first.length + 1)) : clean;
}

// Стартовая страница: index.html в корне, иначе — единственный html, если он
// в наборе ровно один. Двусмысленность («какой из трёх html главный?») не
// разрешаем сами, пусть человек переименует.
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

// Проверки до записи: тяжёлый файл, слишком много файлов, нечего показывать.
// Возвращаем текст ошибки — его же показываем человеку, без кодов и словарей.
export function validateUpload(input: SiteFile[]): { ok: true; value: UploadCheck } | { ok: false; error: string } {
  // сначала выкидываем мусор, потом срезаем обёртку — так порядок сохраняется
  // и новые пути ложатся на свои же размеры
  const kept = input.filter((f) => !isJunk(f.path));
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
  const unsafe = files.find((f) => !isSafePath(f.path));
  if (unsafe) return { ok: false, error: `Недопустимый путь: «${unsafe.path}»` };

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

// Тип отдаём по расширению: браузер не станет исполнять css как html, а
// nosniff в роуте не даст ему угадывать самому.
export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

// Response не принимает Uint8Array по типам (BodyInit ждёт ArrayBuffer или
// Blob), поэтому отдаём буфер ровно по длине данных — без хвоста, который
// мог остаться от переиспользованного буфера.
export function bodyFrom(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
