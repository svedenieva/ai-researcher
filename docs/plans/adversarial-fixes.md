# Устранение находок адверсариального ревью — план внедрения

**Цель:** закрыть подтверждённые дыры адверсариального ревью так, чтобы красные тесты в `tests/adversarial/` стали зелёными, а существующие тесты остались зелёными.

**Архитектура:** правки точечные и почти все — в местах записи, а не чтения. Три сквозные идеи: (1) сервер владеет служебными полями записи и никогда не берёт их из тела запроса; (2) у любого пользовательского ввода есть потолок; (3) наружу уходит обобщённая ошибка, подробности — в `console.error`. Новых зависимостей не добавляется.

## Global Constraints

- Существующие тесты обязаны остаться зелёными после КАЖДОЙ задачи. Это критерий приёмки каждой задачи.
- Тесты в `tests/adversarial/` НЕ переписывать под текущее поведение. Красный тест — это требование.
- Комментарии в коде — на английском. Тексты ошибок, видимые пользователем, — на русском.
- Никаких новых зависимостей в `package.json`.
- Коммит после каждой задачи, отдельным сообщением.
- Ветка: `review/adversarial`.

## Принятые решения владельца

- **Задача 4 (потолки):** 1000 строк за запрос, 64 КБ на ячейку, 200 символов на имя базы, глубина 10.
- **Задача 18:** СПРЯТАТЬ список инструментов от неавторизованных. Тест НЕ удалять.
- **Задача 20:** отдавать `owner` ТОЛЬКО для своих баз (`b.owner === me`), иначе `null`. Тест НЕ удалять.
- **Задача 6:** CSP включаем как описано, вместе с `connect-src 'none'`.

## Важно перед началом

**Находка «двоеточие внутри токена» — ложная.** `lib/mcp/tokens.ts` уже содержит `if (email.includes(':')) continue;`. Ничего не чинить.

**`__mode` — живая функция, не мусор.** Колонка «Режим» переключается пользователем в сетке: правка ячейки уходит как `PATCH /api/records` с `data: {__mode: 'Проверено'}`. Вырезать `__mode` из тела запроса НЕЛЬЗЯ — сломается переключатель. Правильное решение: значение принимается, но проверяется по `MODE_VALUES`.

**`descendantsOf` в `lib/datasource/tree.ts` УЖЕ защищён множеством `seen`.** Шаг про обход в задаче 10 уже выполнен — только проверить, не переписывать.

---

## Task 1: Сервер владеет идентификатором и позицией строки

**Дыра:** критичная. `data.id` из тела запроса перекрывает серверный id, потому что спред стоит последним. Дальше `update_record` / `delete_rows` / `restore` адресуются не в ту запись. `__pos` из тела задаёт порядок строк в чужой таблице.

**Файлы:** `lib/datasource/customStore.ts` (память: `addRecord`, `addRecords`, `updateRecord`; Supabase: те же три метода)

**Тесты (существуют):** `tests/adversarial/records-injection.test.ts`

**Производит:** `sanitizeRecordData(data: Record<string, unknown>): Record<string, unknown>` — экспорт из `lib/datasource/customStore.ts`. Используется задачами 2 и 12.

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/records-injection.test.ts -t "Подмена идентификатора строки"
```

Ожидается: 3 упавших теста.

### Шаг 2: добавить санитайзер в `lib/datasource/customStore.ts`

Вставить рядом с `normalizeNewColumn`:

```ts
// Fields the server owns. They must never arrive from the caller.
//   id       — the row's identity. It used to be overridable because the object
//              was built as { id, ...data }: a caller-supplied data.id won, two
//              rows could share an id, and every later update/delete/restore
//              addressed the wrong one.
//   __pos    — manual sort position, written only by reorderRecords.
//   __source — the originating base name, computed on read for nested views.
// __mode is deliberately NOT here: it is the user-facing "Режим" column and a
// person toggles it in the grid. It is validated instead — see below.
const SERVER_OWNED = new Set(['id', '__pos', '__source']);

export function sanitizeRecordData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SERVER_OWNED.has(k)) continue;
    // an unknown mode would sit in storage as garbage; recordMode() masks it on
    // read, so the bug would stay invisible until an export or a raw query
    if (k === MODE_KEY && v !== MODE_RESEARCH && v !== MODE_REFERENCE) continue;
    out[k] = v;
  }
  return out;
}
```

Добавить `MODE_REFERENCE` в существующий импорт из `../mode`.

### Шаг 3: применить санитайзер во всех точках записи

`MemoryCustomStore.addRecord`:

```ts
const record = { id: `r${++this.seq}`, [MODE_KEY]: MODE_RESEARCH, ...sanitizeRecordData(data) } as CatalogRecord;
```

`MemoryCustomStore.addRecords`:

```ts
for (const data of rows) bucket.push({ id: `r${++this.seq}`, [MODE_KEY]: MODE_RESEARCH, ...sanitizeRecordData(data) } as CatalogRecord);
```

`MemoryCustomStore.updateRecord`:

```ts
Object.assign(row, sanitizeRecordData(patch));
```

Supabase `addRecord`:

```ts
.insert({ base_id: baseId, data: { [MODE_KEY]: MODE_RESEARCH, ...sanitizeRecordData(data) } })
```

Supabase `addRecords`:

```ts
const payload = rows.map((data) => ({ base_id: baseId, data: { [MODE_KEY]: MODE_RESEARCH, ...sanitizeRecordData(data) } }));
```

Найти в этом же классе `updateRecord` и обернуть патч там же. Правило: любой вызов, кладущий пользовательский объект в колонку `data`, проходит через `sanitizeRecordData`.

### Шаг 4: прогнать целевые тесты

```bash
npx vitest run tests/adversarial/records-injection.test.ts
```

### Шаг 5: убедиться, что переключатель режима жив

```bash
npx vitest run app/api/records/route.test.ts lib/records-query.test.ts lib/datasource/customStore.test.ts
```

Если упал тест про `__mode` — валидация отсекает легитимное значение; сверься с `MODE_VALUES` в `lib/mode.ts`.

### Шаг 6: коммит

```bash
git add lib/datasource/customStore.ts && git commit -m "fix(records): the server owns row id and position, not the request body"
```

---

## Task 2: Ключ `id` зарезервирован для колонок

**Дыра:** критичная. Колонка с меткой «ID» получает ключ `id`, её значение попадает в `data.id` и подменяет идентификатор строки. Достигается обычным импортом выгрузки из CRM.

**Файлы:** `lib/datasource/customStore.ts` (`normalizeNewColumn`), `app/api/bases/route.ts` (`normalizeColumns`), `app/api/mcp/route.ts` (локальная `normalizeColumns`)

**Тест (существует):** `tests/adversarial/records-injection.test.ts` → «Колонка с системным именем»

**Производит:** `RESERVED_COLUMN_KEYS: Set<string>` — экспорт из `lib/datasource/customStore.ts`.

### Шаг 1: убедиться, что тест красный

```bash
npx vitest run tests/adversarial/records-injection.test.ts -t "Колонка с системным именем"
```

### Шаг 2: объявить резерв в `lib/datasource/customStore.ts`

Рядом с `SERVER_OWNED` из задачи 1:

```ts
// Column keys that would collide with a record's own fields. "ID" is a column
// label in half the CRM exports out there, and its derived key is exactly `id`.
export const RESERVED_COLUMN_KEYS = new Set(['id', '__mode', '__pos', '__source']);
```

### Шаг 3: развести ключ в `normalizeNewColumn`

```ts
let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${existing.length}`;
const used = new Set(existing.map((c) => c.key));
while (used.has(key) || RESERVED_COLUMN_KEYS.has(key)) key = `${key}_`;
```

### Шаг 4: то же в `app/api/bases/route.ts`

```ts
let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${cols.length}`;
while (used.has(key) || RESERVED_COLUMN_KEYS.has(key)) key = `${key}_`;
```

Расширить импорт: `import { getCustomStore, canAccessBase, RESERVED_COLUMN_KEYS, type CustomBase } from '@/lib/datasource/customStore';`

### Шаг 5: то же в `app/api/mcp/route.ts`

Найти локальную `normalizeColumns` и применить тот же `while`. Импорт `RESERVED_COLUMN_KEYS` добавить к существующему импорту.

### Шаг 6: прогнать

```bash
npx vitest run tests/adversarial/records-injection.test.ts app/api/bases/route.test.ts app/api/mcp/route.test.ts
```

### Шаг 7: коммит

```bash
git add lib/datasource/customStore.ts app/api/bases/route.ts app/api/mcp/route.ts && git commit -m "fix(columns): reserve the id key so an imported ID column can't hijack the row id"
```

---

## Task 3: Белый список схем в колонке типа url

**Дыра:** критичная. Значение колонки типа `url` уходит в `href` без нормализации, поэтому `javascript:` и `data:text/html` дают хранимую XSS на нашем origin.

**Файлы:** создать `lib/safe-url.ts`; изменить `app/api/records/route.ts` (POST и PATCH)

**Тест (существует):** `tests/adversarial/records-injection.test.ts` → «Опасная схема в колонке-ссылке»

**Производит:** `isSafeUrlValue(value: unknown): boolean` из `lib/safe-url.ts`.

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/records-injection.test.ts -t "Опасная схема"
```

### Шаг 2: создать `lib/safe-url.ts`

```ts
// Schemes allowed in a url-typed cell. The value ends up in an anchor's href,
// so anything the browser will execute in page context (javascript:, data: with
// an html payload, vbscript:) is a stored-XSS vector: the code then runs on our
// own origin with the viewer's session.
//
// A bare value with no scheme (example.com, /page, ./file) is left alone — it is
// not executable and rejecting it would break ordinary paste-a-link usage.
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function isSafeUrlValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  const s = String(value).trim();
  // control characters are how "java\nscript:" slips past a naive scheme check
  const bare = s.replace(/[ - ]/g, '');
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(bare);
  if (!m) return true; // relative or scheme-less — nothing to execute
  return ALLOWED_SCHEMES.has(`${m[1].toLowerCase()}:`);
}
```

### Шаг 3: проверять при записи в `app/api/records/route.ts`

Импорт: `import { isSafeUrlValue } from '@/lib/safe-url';`

Функция перед `POST`:

```ts
// A url-typed cell may only carry a scheme the browser won't execute.
function badUrlCell(columns: { key: string; type: string }[], data: Record<string, unknown>): string | null {
  for (const col of columns) {
    if (col.type !== 'url') continue;
    if (!isSafeUrlValue(data[col.key])) return col.key;
  }
  return null;
}
```

В `POST`, сразу после проверки доступа:

```ts
if (badUrlCell(base.columns, data)) {
  return Response.json({ error: 'В колонку-ссылку можно записать только http, https, mailto или tel' }, { status: 400 });
}
```

В `PATCH` — тем же блоком, но с `patch` вместо `data`.

### Шаг 4: прогнать

```bash
npx vitest run tests/adversarial/records-injection.test.ts app/api/records/route.test.ts
```

### Шаг 5: коммит

```bash
git add lib/safe-url.ts app/api/records/route.ts && git commit -m "fix(records): only executable-free schemes may enter a url column"
```

---

## Task 4: Потолки на объём ввода

**Дыра:** важная. Проходят ячейка 2 МБ, имя базы 100 000 символов, 10 000 строк одним запросом, объект глубиной 5000.

**Файлы:** создать `lib/limits.ts`; изменить `app/api/records/route.ts` (POST, PATCH), `app/api/bases/route.ts` (POST), `app/api/mcp/route.ts` (`add_rows`, `create_base`)

**Тесты (существуют):** `tests/adversarial/records-injection.test.ts` → «Объём ввода», `tests/adversarial/mcp-input-fuzz.test.ts` → «add_rows — типы и объём»

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial -t "Объём ввода"
```

### Шаг 2: создать `lib/limits.ts`

```ts
// Ceilings on user input. Without them one caller — or one confused model on the
// MCP connector — fills the storage in a single request. Vercel caps a request
// body at ~4.5 MB, which bounds bytes but not row count or nesting depth.
export const MAX_ROWS_PER_REQUEST = 1000;
export const MAX_CELL_CHARS = 64_000;
export const MAX_NAME_CHARS = 200;
export const MAX_DEPTH = 10;

function depthOf(value: unknown, level = 0): number {
  if (level > MAX_DEPTH) return level;
  if (value === null || typeof value !== 'object') return level;
  let deepest = level;
  for (const v of Object.values(value as Record<string, unknown>)) {
    deepest = Math.max(deepest, depthOf(v, level + 1));
    if (deepest > MAX_DEPTH) return deepest;
  }
  return deepest;
}

/** Null when the row is acceptable, otherwise the message to send back. */
export function checkPayload(data: Record<string, unknown>): string | null {
  if (depthOf(data) > MAX_DEPTH) return 'Слишком глубокая вложенность значения';
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
      return `Значение в поле «${key}» длиннее ${MAX_CELL_CHARS} символов`;
    }
  }
  return null;
}

export function checkRowCount(n: number): string | null {
  return n > MAX_ROWS_PER_REQUEST ? `За один раз можно добавить не больше ${MAX_ROWS_PER_REQUEST} строк` : null;
}

export function checkName(name: string): string | null {
  return name.length > MAX_NAME_CHARS ? `Название длиннее ${MAX_NAME_CHARS} символов` : null;
}
```

### Шаг 3: применить в `app/api/records/route.ts`

Импорт: `import { checkPayload } from '@/lib/limits';`

В `POST` и в `PATCH`, сразу после разбора `data` / `patch`, до обращения к хранилищу:

```ts
const tooBig = checkPayload(data);
if (tooBig) return Response.json({ error: tooBig }, { status: 400 });
```

### Шаг 4: применить в `app/api/bases/route.ts`

Импорт: `import { checkName, checkPayload, checkRowCount } from '@/lib/limits';`

После проверки `if (!name)`:

```ts
const longName = checkName(name);
if (longName) return Response.json({ error: longName }, { status: 400 });
```

После `const rows = mapRows(...)`, до `addRecords`:

```ts
const tooMany = checkRowCount(rows.length);
if (tooMany) return Response.json({ error: tooMany }, { status: 400 });
for (const row of rows) {
  const tooBig = checkPayload(row);
  if (tooBig) return Response.json({ error: tooBig }, { status: 400 });
}
```

### Шаг 5: применить в `app/api/mcp/route.ts`

В ветках `create_base` и `add_rows` — та же пара проверок, но через `failed(...)`:

```ts
const tooMany = checkRowCount(rows.length);
if (tooMany) return failed(tooMany);
for (const row of rows) {
  const tooBig = checkPayload(row);
  if (tooBig) return failed(tooBig);
}
```

### Шаг 6: прогнать

```bash
npx vitest run tests/adversarial/records-injection.test.ts tests/adversarial/mcp-input-fuzz.test.ts
```

### Шаг 7: коммит

```bash
git add lib/limits.ts app/api/records/route.ts app/api/bases/route.ts app/api/mcp/route.ts && git commit -m "feat(limits): cap row count, cell size, name length and nesting depth"
```

---

## Task 5: Текст ошибки Supabase не уходит наружу

**Дыра:** важная. Шесть путей пересказывают `e.message` дословно — вместе с именем таблицы, классом ошибки БД и всем, что драйвер положил в текст. Отдельным тестом доказано, что так наружу уезжает и чужая почта.

**Файлы:** создать `lib/errors.ts`; изменить `app/api/records/route.ts` (POST, PATCH), `app/api/bases/route.ts`, `app/api/columns/route.ts`, `app/api/records/reorder/route.ts`, `app/api/sites/route.ts`, `app/api/mcp/route.ts`

**Тесты (существуют):** `tests/adversarial/error-leaks.test.ts`

**Производит:** `publicError(e: unknown, fallback: string, context: string): string` из `lib/errors.ts`.

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/error-leaks.test.ts
```

### Шаг 2: создать `lib/errors.ts`

```ts
// What the caller is allowed to learn about a server-side failure: that it
// happened. The details — relation names, the project's address, whatever the
// driver put in the string, and in one observed case another person's email —
// go to the server log instead.
export function publicError(e: unknown, fallback: string, context: string): string {
  console.error(`${context}:`, e);
  return fallback;
}
```

### Шаг 3: заменить шесть `catch`

`app/api/records/route.ts` POST:

```ts
} catch (e) {
  return Response.json({ error: publicError(e, 'Не удалось добавить строку', 'addRecord failed') }, { status: 500 });
}
```

`app/api/records/route.ts` PATCH:

```ts
} catch (e) {
  return Response.json({ error: publicError(e, 'Не удалось обновить строку', 'updateRecord failed') }, { status: 500 });
}
```

`app/api/bases/route.ts`:

```ts
} catch (e) {
  return Response.json({ error: publicError(e, 'Не удалось создать базу', 'createBase failed') }, { status: 500 });
}
```

`app/api/columns/route.ts`:

```ts
} catch (e) {
  return Response.json({ error: publicError(e, 'Не удалось изменить колонки', 'columns change failed') }, { status: 500 });
}
```

`app/api/records/reorder/route.ts` и `app/api/sites/route.ts` — по тому же образцу, тексты: «Не удалось изменить порядок» и «Не удалось получить список сайтов».

`app/api/mcp/route.ts` (общий catch вокруг вызова инструмента):

```ts
return reply(failed(publicError(e, 'tool call failed', `mcp tool ${name} failed`)));
```

Импорт в каждый файл: `import { publicError } from '@/lib/errors';`

### Шаг 4: прогнать

```bash
npx vitest run tests/adversarial/error-leaks.test.ts && npm test
```

Существующий тест может ожидать конкретный текст ошибки. Это законная причина уточнить `fallback`, но не причина вернуть `e.message`.

### Шаг 5: коммит

```bash
git add lib/errors.ts app/api/records/route.ts app/api/bases/route.ts app/api/columns/route.ts app/api/records/reorder/route.ts app/api/sites/route.ts app/api/mcp/route.ts && git commit -m "fix(api): report that a storage call failed, not what the driver said"
```

---

## Task 6: Чужой HTML изолирован от нашего API

**Дыра:** критичная. `/s/<id>/…` отдаёт залитый пользователем HTML с того же origin, что и витрина. Скрипт внутри такого сайта ходит в `/api/*` с сессионными куками того, кто открыл ссылку.

**РЕШЕНИЕ ВЛАДЕЛЬЦА ПРИНЯТО:** включаем как описано, вместе с `connect-src 'none'`.

**Файлы:** `app/s/[id]/[[...path]]/route.ts`

**Тесты (существуют):** `tests/adversarial/sites-path-traversal.test.ts` → «Чужой HTML на нашем домене»

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/sites-path-traversal.test.ts -t "Чужой HTML"
```

### Шаг 2: заголовки изоляции

Заменить блок `headers`:

```ts
headers: {
  'Content-Type': contentTypeFor(rel),
  // type is taken from the extension — don't let the browser guess it
  'X-Content-Type-Options': 'nosniff',
  // a site can be re-uploaded at the same address, so cache only with revalidation
  'Cache-Control': 'private, no-cache',
  // An uploaded site is someone else's code running on our origin. Without
  // this it can fetch /api/* with the viewer's session cookies and act as
  // them. sandbox drops it into an opaque origin, so document.cookie and
  // same-origin XHR stop working; the allow-* list keeps ordinary pages
  // (scripts, styles, forms) usable.
  'Content-Security-Policy':
    "default-src 'self' data: blob:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-popups allow-forms",
},
```

### Шаг 3: прогнать

```bash
npx vitest run "app/s/[id]/[[...path]]/route.test.ts" tests/adversarial/sites-path-traversal.test.ts
```

Заголовок добавляется, ничего не убирая — существующий тест раздачи должен остаться зелёным.

### Шаг 4: коммит

```bash
git add "app/s/[id]/[[...path]]/route.ts" && git commit -m "fix(sites): sandbox an uploaded site away from our API and cookies"
```

---

## Task 7: Загрузка файлов сайта привязана к манифесту

**Дыра:** важная. `POST /api/sites/[id]/files` проверяет только безопасность пути и размер одного файла: ни соответствия манифесту, ни счётчика, ни суммарного объёма.

**Файлы:** `app/api/sites/[id]/files/route.ts`, `lib/sites/site.ts` (`validateUpload`)

**Тесты (существуют):** `tests/adversarial/sites-path-traversal.test.ts` → «Загрузка файлов сайта»

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/sites-path-traversal.test.ts -t "Загрузка файлов сайта"
```

### Шаг 2: суммарный потолок в `lib/sites/site.ts`

Рядом с `MAX_FILE_BYTES` и `MAX_FILES`:

```ts
// Per-file and per-count ceilings existed; the sum did not, so 200 files of
// exactly 10 MB each passed as 2 GB in one upload.
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
```

В `validateUpload`, перед `pickEntry`:

```ts
const total = files.reduce((s, f) => s + f.size, 0);
if (total > MAX_TOTAL_BYTES) {
  const mb = (total / 1024 / 1024).toFixed(0);
  return { ok: false, error: `Сайт весит ${mb} МБ — больше ${MAX_TOTAL_BYTES / 1024 / 1024} МБ` };
}
```

### Шаг 3: отказ вместо выправления манифеста

`stripCommonPrefix` выполняется ДО `isSafePath`, поэтому набор путей вида `../x/a.html` целиком «лежит внутри» общей папки `..`, она срезается, и пути молча становятся безопасными. Вставить сразу после `const kept = …`:

```ts
// check the paths as uploaded, before the wrapper folder is trimmed: a set
// that all starts with '..' looks "wrapped" to stripCommonPrefix, which then
// silently rewrites the intent instead of refusing it
const rawUnsafe = kept.find((f) => !isSafePath(f.path));
if (rawUnsafe) return { ok: false, error: `Недопустимый путь: «${rawUnsafe.path}»` };
```

### Шаг 4: привязать дозагрузку к манифесту

`app/api/sites/[id]/files/route.ts`:

```ts
try {
  const store = getSiteStore();
  // without a row in the table the file would hang in storage owned by no one
  const site = await store.get(id);
  if (!site) return Response.json({ error: 'Сайт не найден' }, { status: 404 });
  // The manifest is the contract agreed at validateUpload time. Accepting a
  // path outside it turned this route into unbounded storage: MAX_FILES and
  // the total-size ceiling were both bypassed one request at a time.
  if (!site.files.some((f) => f.path === path)) {
    return Response.json({ error: `Файла «${path}» нет в составе сайта` }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await store.putFile(id, path, bytes, contentTypeFor(path));
  return Response.json({ ok: true, path, size: bytes.length });
} catch (e) {
```

Если поле манифеста называется не `site.files` — посмотреть тип в `lib/sites/store.ts`.

### Шаг 5: прогнать

```bash
npx vitest run tests/adversarial/sites-path-traversal.test.ts lib/sites/site.test.ts
```

### Шаг 6: коммит

```bash
git add "app/api/sites/[id]/files/route.ts" lib/sites/site.ts && git commit -m "fix(sites): bind file upload to the manifest and cap the total size"
```

---

## Task 8: zip-slip отсекается на распаковке

**Дыра:** важная. `unzipEntries` фильтрует только мусор архиватора и папки; запись с `..` в пути возвращается как обычный файл.

**Файлы:** `lib/sites/zip.ts`

**Тест (существует):** `tests/adversarial/sites-path-traversal.test.ts` → «Архив»

### Шаг 1: убедиться, что тест красный

```bash
npx vitest run tests/adversarial/sites-path-traversal.test.ts -t "unzipEntries"
```

### Шаг 2: отсечь небезопасные записи

```ts
import { isJunk, isSafePath } from './site';
```

```ts
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
```

### Шаг 3: прогнать и закоммитить

```bash
npx vitest run lib/sites/zip.test.ts tests/adversarial/sites-path-traversal.test.ts
```

```bash
git add lib/sites/zip.ts && git commit -m "fix(zip): drop entries that escape their own folder"
```

---

## Task 9: Управляющие символы в пути файла сайта

**Дыра:** косметика. `isSafePath` не проверяет управляющих символов — нулевой байт и перевод строки проходят и уезжают в ключ Storage.

**Файлы:** `lib/sites/site.ts`

**Тесты (существуют):** `tests/adversarial/sites-path-traversal.test.ts` → «Выход за пределы своей папки»

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/sites-path-traversal.test.ts -t "байт"
```

### Шаг 2: дополнить проверку

```ts
export function isSafePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false;
  // a NUL or a newline is never part of a real file name; it reaches the storage
  // key as-is and what the backend then does with it is anyone's guess
  if (/[ -]/.test(path)) return false;
  return !path.split('/').some((p) => p === '..' || p === '.' || p === '');
}
```

### Шаг 3: прогнать и закоммитить

```bash
npx vitest run lib/sites/site.test.ts tests/adversarial/sites-path-traversal.test.ts
```

```bash
git add lib/sites/site.ts && git commit -m "fix(sites): reject control characters in a file path"
```

---

## Task 10: Родитель базы проверяется, цикл ищется по всем базам

**Дыра:** важная. Две половины:

1. `create_base` через MCP берёт `parent` как есть — база создаётся под чужим приватным или несуществующим узлом. `move_base` проверяет существование родителя, но не доступ к нему.
2. REST-проверка цикла смотрит только на **видимые** проверяющему базы. Через невидимое звено собирается цикл.

В MCP правильная реализация уже есть — `wouldCreateCycle` ходит по `listAllBases`.

**Файлы:** `app/api/mcp/route.ts` (`create_base`, `move_base`), `app/api/bases/route.ts`

**Тесты (существуют):** `tests/adversarial/tree-cycle.test.ts` → «Родитель, которого нет», «Циклы через невидимое звено»

**ВАЖНО:** `lib/datasource/tree.ts` УЖЕ содержит защиту от повторов (`seen`). Только проверить, НЕ переписывать.

**Производит:** `badParent(store, parent, me): Promise<string | null>` — локальная функция в `app/api/mcp/route.ts`.

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/tree-cycle.test.ts
```

### Шаг 2: общая проверка родителя в `app/api/mcp/route.ts`

Добавить рядом с `wouldCreateCycle`:

```ts
// A parent must exist AND be reachable by the caller. Without the access half,
// a base could be filed under someone else's private node: its rows then show
// up in that person's merged view, and the invisible link is the middle piece
// of the cycle that makes /api/records recurse forever.
async function badParent(store: CustomStore, parent: string, me: string | null): Promise<string | null> {
  if (BUILTIN_IDS.has(parent)) return null;
  const base = await store.getBase(parent);
  if (!base || !canAccessBase(base, me)) return `no base with id ${parent}`;
  return null;
}
```

### Шаг 3: применить в `create_base`

После разбора `parent`:

```ts
if (parent) {
  const bad = await badParent(store, parent, me);
  if (bad) return failed(bad);
}
```

### Шаг 4: применить в `move_base`

```ts
if (parent === id) return failed('a base cannot be its own parent');
const bad = await badParent(store, parent, me);
if (bad) return failed(bad);
if (await wouldCreateCycle(store, id, parent)) return failed('moving the base would create a parent cycle');
```

### Шаг 5: REST ищет цикл по всем базам

`app/api/bases/route.ts` — заменить `store.listBases(me)` на `store.listAllBases()` в проверке цикла:

```ts
// the cycle check must see EVERY base, not just the ones visible to the
// mover: a link through someone else's private base is invisible here but
// very much real in the tree, and the resulting cycle makes /api/records
// recurse until RangeError on every read of that branch
const all = await store.listAllBases();
```

### Шаг 6: проверить `lib/datasource/tree.ts`

Убедиться, что `descendantsOf` ведёт множество посещённых. Она УЖЕ такая — только подтвердить, ничего не менять.

### Шаг 7: прогнать

```bash
npx vitest run tests/adversarial/tree-cycle.test.ts app/api/bases/route.test.ts app/api/records/route.test.ts app/api/mcp/route.test.ts
```

### Шаг 8: коммит

```bash
git add app/api/mcp/route.ts app/api/bases/route.ts && git commit -m "fix(tree): validate the parent and look for cycles across every base"
```

---

## Task 11: Границы пагинации `query_records`

**Дыра:** важная. `offset: -3` отдаёт хвост набора как «первую страницу»; нечисловой `limit` даёт `NaN`, пустой массив и при этом `hasMore: true`; `limit: 1000000` отдаёт всю базу.

**Файлы:** `app/api/mcp/route.ts` (ветка `query_records`)

**Тесты (существуют):** `tests/adversarial/mcp-input-fuzz.test.ts` → «query_records — границы пагинации»

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/mcp-input-fuzz.test.ts -t "пагинац"
```

### Шаг 2: нормализовать границы

```ts
// Number('abc') is NaN, and NaN survives slice() as 0 while still failing
// every comparison — the caller got an empty page with hasMore: true and
// paginated forever. A negative offset reads to slice() as "from the end".
const MAX_PAGE = 500;
const rawLimit = Number(args.limit ?? 50);
const rawOffset = Number(args.offset ?? 0);
const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_PAGE) : 50;
const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
```

Обе ветки ниже уже используют `offset` и `limit` — менять их не нужно.

### Шаг 3: прогнать и закоммитить

```bash
npx vitest run tests/adversarial/mcp-input-fuzz.test.ts app/api/mcp/route.test.ts
```

```bash
git add app/api/mcp/route.ts && git commit -m "fix(mcp): clamp query_records paging instead of trusting the caller"
```

---

## Task 12: Значения не портятся при записи через MCP

**Дыра:** важная. `mapRow` превращает вложенный объект в строку `[object Object]`; нечисловая строка в числовой колонке становится `NaN` в хранилище.

**Файлы:** `app/api/mcp/route.ts` (`mapRow`)

**Тесты (существуют):** `tests/adversarial/mcp-input-fuzz.test.ts`

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/mcp-input-fuzz.test.ts -t "object Object"
```

### Шаг 2: прочитать, чего именно ждут тесты

Оба теста формулируют требование «не сохраняется как …», но не обязательно требуют одного исхода: возможен отказ, а возможно — сохранение структуры. Открыть оба и определить контракт. **Тест здесь главнее текста ниже.**

### Шаг 3: переписать `mapRow`

```ts
// row-object (keyed by label or key) → object keyed by column keys
function mapRow(cols: ColumnDef[], row: unknown): Record<string, unknown> {
  const src = (row ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const col of cols) {
    const v = src[col.key] ?? src[col.label];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    if (col.type === 'number') {
      const n = Number(String(v).replace(',', '.'));
      // NaN in storage breaks every sort and sum downstream, and nothing later
      // can tell it apart from a number that was always missing — drop it
      if (!Number.isFinite(n)) continue;
      data[col.key] = n;
      continue;
    }
    // an object stringifies to "[object Object]" — that is silent data loss, so
    // keep the structure and let the storage layer hold it as jsonb
    data[col.key] = typeof v === 'object' ? v : String(v);
  }
  return data;
}
```

### Шаг 4: прогнать и закоммитить

```bash
npx vitest run tests/adversarial/mcp-input-fuzz.test.ts app/api/mcp/route.test.ts
```

```bash
git add app/api/mcp/route.ts && git commit -m "fix(mcp): stop turning values into [object Object] and NaN"
```

---

## Task 13: Потолок длины запроса `research_decompose`

**Дыра:** важная. Промпт в 1 МБ уходит в модель как есть. Инструмент доступен любому валидному токену и расходует общий `ANTHROPIC_API_KEY`.

**Файлы:** `app/api/mcp/route.ts` (ветка `research_decompose`)

**Тест (существует):** `tests/adversarial/mcp-input-fuzz.test.ts` → «research_decompose — расход чужого ключа»

### Шаг 1: убедиться, что тест красный

```bash
npx vitest run tests/adversarial/mcp-input-fuzz.test.ts -t "research_decompose"
```

### Шаг 2: добавить проверку

Сразу после `if (!prompt) return failed('empty query');`:

```ts
// The tool spends a shared ANTHROPIC_API_KEY and any valid token can call
// it. A research question is a sentence, not a megabyte.
const MAX_PROMPT_CHARS = 4000;
if (prompt.length > MAX_PROMPT_CHARS) {
  return failed(`query is longer than ${MAX_PROMPT_CHARS} characters`);
}
```

Проверка должна стоять ДО вызова `decompose(prompt)`.

### Шаг 3: прогнать и закоммитить

```bash
npx vitest run tests/adversarial/mcp-input-fuzz.test.ts
```

```bash
git add app/api/mcp/route.ts && git commit -m "fix(mcp): cap the research_decompose prompt length"
```

---

## Task 14: Обезвреживание формул в CSV

**Дыра:** важная. `csvField` экранирует строго по RFC 4180 и ничего не делает с ведущими `=`, `+`, `-`, `@`. Ячейка `=cmd|…` выполняется при открытии файла двойным кликом.

**Файлы:** `lib/csv.ts`

**Тесты (существуют):** `tests/adversarial/csv-export.test.ts`

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/csv-export.test.ts
```

### Шаг 2: обезвредить ведущие знаки формулы

```ts
const NEEDS_QUOTES = /[",\r\n]/;

// RFC 4180 says nothing about this, and that is exactly the problem: a value
// starting with =, +, - or @ is a FORMULA to Excel, Google Sheets and LibreOffice
// alike. =cmd|'/c calc'!A1 runs a command on the machine of whoever opens the
// file, and =IMPORTXML(...) quietly ships the sheet's contents to a third party.
// Leading tab and CR count too — the apps strip them before parsing the cell.
const FORMULA_START = /^[\t\r\n ]*[=+\-@]/;

/** A single field per rules 5–7, with spreadsheet formulas defused. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // A leading apostrophe is the spreadsheet's own "treat as text" marker: it is
  // consumed on open, so the value reads correctly and no longer evaluates.
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (!NEEDS_QUOTES.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}
```

`toCsv` уже прогоняет через `csvField` и заголовки, поэтому шапка защищается тем же изменением.

### Шаг 3: прогнать

```bash
npx vitest run lib/csv.test.ts tests/adversarial/csv-export.test.ts app/api/records/export/route.test.ts
```

Существующие тесты CSV проверяют экранирование по RFC — они должны остаться зелёными.

### Шаг 4: коммит

```bash
git add lib/csv.ts && git commit -m "fix(csv): defuse formulas so an export can't run code on open"
```

---

## Task 15: `data` не того типа отвергается

**Дыра:** косметика. `typeof body.data === 'object'` пропускает массив; строка или число дают пустой объект.

**Файлы:** `app/api/records/route.ts` (POST, PATCH)

**Тесты (существуют):** `tests/adversarial/records-injection.test.ts` → «Типы и мусор в теле запроса»

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/records-injection.test.ts -t "Типы и мусор"
```

### Шаг 2: строгая проверка в POST

```ts
// typeof [] === 'object', and a string or number silently collapsed to {} —
// in both cases the row was inserted and the caller got a 200 for nonsense
if (body?.data === undefined || body.data === null || typeof body.data !== 'object' || Array.isArray(body.data)) {
  return Response.json({ error: 'Поле data должно быть объектом' }, { status: 400 });
}
const data = body.data as Record<string, unknown>;
```

### Шаг 3: то же в PATCH, с переменной `patch`

```ts
if (body?.data === undefined || body.data === null || typeof body.data !== 'object' || Array.isArray(body.data)) {
  return Response.json({ error: 'Поле data должно быть объектом' }, { status: 400 });
}
const patch = body.data as Record<string, unknown>;
```

Пустой объект `{}` остаётся допустимым намеренно.

### Шаг 4: прогнать и закоммитить

```bash
npx vitest run tests/adversarial/records-injection.test.ts app/api/records/route.test.ts
```

```bash
git add app/api/records/route.ts && git commit -m "fix(records): reject a data field that isn't an object"
```

---

## Task 16: Публичные пути сравниваются точно

**Дыра:** важная, латентная. `pathname.startsWith(p)` считает публичными `/api/mcp-evil` и `/loginXXX`.

**Файлы:** `middleware.ts`

**Тесты (существуют):** `tests/adversarial/middleware-bypass.test.ts`

### Шаг 1: убедиться, что тесты красные

```bash
npx vitest run tests/adversarial/middleware-bypass.test.ts
```

### Шаг 2: разделить точные пути и префиксы

```ts
// Exact paths, plus prefixes that must end in a slash. Plain startsWith made
// /loginXXX and /api/mcp-evil public: no such route exists today, so Next 404s
// first — but the next route added under either name would be unauthenticated
// and nothing would say so.
const PUBLIC_EXACT = ['/login', '/auth/callback', '/api/mcp'];
const PUBLIC_PREFIXES = ['/auth/callback/', '/api/mcp/', '/.well-known/'];
```

```ts
const isPublic =
  PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
```

### Шаг 3: прогнать

```bash
npx vitest run tests/adversarial/middleware-bypass.test.ts app/api/mcp/route.test.ts app/api/connect/route.test.ts
```

Проверить, что `/auth/callback` со строкой запроса по-прежнему проходит.

### Шаг 4: коммит

```bash
git add middleware.ts && git commit -m "fix(auth): match public paths exactly instead of by prefix"
```

---

## Task 17: Нет почты — нет доступа

**Дыра:** важная. `isAllowed` при пустом `ALLOWED_EMAILS` возвращает `true` до всякой проверки, поэтому `isAllowed(null)` — тоже `true`.

**Файлы:** `lib/supabase-auth.ts`

**Тест (существует):** `tests/adversarial/auth-allowlist.test.ts`

### Шаг 1: убедиться, что тест красный

```bash
npx vitest run tests/adversarial/auth-allowlist.test.ts
```

### Шаг 2: сначала почта, потом список

```ts
export function isAllowed(email?: string | null): boolean {
  // No address at all is never allowed, whatever the list says. The whole access
  // model keys on email, and owner === null already means "base visible to
  // everyone" — an account without one would land inside other people's data.
  const mine = (email ?? '').trim().toLowerCase();
  if (!mine) return false;
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(mine);
}
```

### Шаг 3: прогнать и закоммитить

```bash
npx vitest run tests/adversarial/auth-allowlist.test.ts tests/adversarial/middleware-bypass.test.ts
```

```bash
git add lib/supabase-auth.ts && git commit -m "fix(auth): an account without an email is never allowed"
```

---

## Task 18: Список инструментов MCP без токена

**РЕШЕНИЕ ВЛАДЕЛЬЦА ПРИНЯТО: закрыть список.** Тест НЕ удалять.

**Файлы:** `app/api/mcp/route.ts` (обработчик GET)

**Тест (существует):** `tests/adversarial/mcp-tokens.test.ts` → «GET без токена не перечисляет инструменты сервера»

### Шаг 1: убедиться, что тест красный

```bash
npx vitest run tests/adversarial/mcp-tokens.test.ts -t "не перечисляет"
```

### Шаг 2: отдавать список только авторизованным

```ts
return Response.json(
  {
    server: 'AiS',
    transport: 'http/json-rpc',
    authorized: Boolean(me),
    user: me,
    // the tool list is a map of the write surface (delete_base, empty_bin);
    // an unauthenticated caller only needs to learn that the server is here
    ...(me ? { tools: TOOLS.map((t) => t.name) } : {}),
  },
  { headers: CORS },
);
```

### Шаг 3: прогнать и закоммитить

```bash
npx vitest run tests/adversarial/mcp-tokens.test.ts app/api/mcp/route.test.ts
```

```bash
git add app/api/mcp/route.ts && git commit -m "fix(mcp): list the tools only to an authorized caller"
```

---

## Task 19: Уникальность метки колонки при переименовании

**Дыра:** косметика. `applyColumnPatch` проверяет уникальность только ключа при создании, но не метки при правке.

**Файлы:** `lib/datasource/customStore.ts` (`updateColumn` в обоих хранилищах)

**Тест (существует):** `tests/adversarial/tree-cycle.test.ts` → «переименование колонки в уже занятую метку отклоняется»

### Шаг 1: убедиться, что тест красный

```bash
npx vitest run tests/adversarial/tree-cycle.test.ts -t "занятую метку"
```

### Шаг 2: посмотреть, чего именно ждёт тест

Тест вызывает `update_column` через MCP и проверяет `expect(error).toBeTruthy()`. Значит, контракт — отказ, доходящий до конверта MCP. Убедиться, чем именно его вернуть.

### Шаг 3: проверять занятость метки в `updateColumn`

Перед вызовом `applyColumnPatch`:

```ts
const wanted = patch.label !== undefined ? String(patch.label).trim() : null;
// two columns with the same label give a CSV header and a filter list with
// two identical entries — the keys stay distinct, so the data is fine, but
// the table stops being readable
if (wanted && base.columns.some((c) => c.key !== key && c.label === wanted)) return null;
```

### Шаг 4: прогнать и закоммитить

```bash
npx vitest run tests/adversarial/tree-cycle.test.ts lib/datasource/customStore.test.ts app/api/bases/route.test.ts
```

```bash
git add lib/datasource/customStore.ts && git commit -m "fix(columns): refuse a rename onto a label already in use"
```

---

## Task 20: Почта владельца в списке баз

**РЕШЕНИЕ ВЛАДЕЛЬЦА ПРИНЯТО: отдавать `owner` только для своих баз.** Тест НЕ удалять.

**Файлы:** `app/api/bases/route.ts`

**Тест (существует):** `tests/adversarial/tenancy.test.ts` → «GET /api/bases не раскрывает почту владельца чужой общей базы»

### Шаг 1: убедиться, что тест красный

```bash
npx vitest run tests/adversarial/tenancy.test.ts -t "почту владельца"
```

### Шаг 2: отдавать только свою почту

```ts
// another person's address is theirs, not a property of the base; show
// it only where it is already your own
owner: b.owner && b.owner === me ? b.owner : null,
```

### Шаг 3: проверить витрину

`app/bases/page.tsx` показывает автора; при `owner: null` она уже подставляет «команда». Убедиться, что ничего не сломалось.

### Шаг 4: прогнать и закоммитить

```bash
npx vitest run tests/adversarial/tenancy.test.ts app/api/bases/route.test.ts
```

```bash
git add app/api/bases/route.ts && git commit -m "fix(bases): show the owner email only on your own bases"
```

---

## Финальная проверка

```bash
npm test
npx tsc --noEmit
npm run build
```

Ожидается: 0 упавших тестов.

Обновить `tests/adversarial/REPORT.md`: отметить закрытые находки, зафиксировать решения по задачам 18 и 20, пометить находку про двоеточие в токене как ложную.

**Кодом не закрывается (вынести отдельно, не считать сделанным):**

- RLS в Supabase отсутствует полностью — вся изоляция держится на прикладном коде.
- Отдельный origin для `/s/` — CSP смягчает, но не изолирует.
- Не покрыто тестами: timing-safe сравнение токенов, zip-бомба, гонки одновременной записи.
- `ALLOWED_EMAILS` в Production — проверено, задана.
