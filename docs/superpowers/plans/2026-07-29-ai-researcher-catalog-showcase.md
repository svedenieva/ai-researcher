# AI-Researcher — Catalog Showcase (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only mind-sheet that renders the real product catalog through a swappable `DataSource` abstraction (local JSON now, Supabase later).

**Architecture:** New standalone Next.js (App Router) app. A `DataSource` interface hides the storage; `JsonDataSource` reads a seed file and applies sort/filter in memory. `GET /api/records` returns `{columns, records}`. A controlled `MindSheet` component renders columns declaratively; `app/page.tsx` owns sort/filter state and fetches the API.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5 (strict), Vitest + @testing-library/react (jsdom). No external UI libraries.

## Global Constraints

- App Router only (`app/` directory). No `pages/`.
- TypeScript `strict: true`.
- No external UI/table/state libraries — hand-written table.
- All data flows through the `DataSource` interface. UI and API must not read storage directly.
- Slice is **read-only**: no writes, no Supabase, no MCP, no auth, no search engine.
- **No fabricated catalog data.** Seed records must be real (from the captured catalog); tests use their own inline fixtures, never invented "product" facts.
- UI copy in Russian.
- Path alias `@/*` → project root.

---

## File Structure

- `package.json`, `tsconfig.json`, `next.config.js`, `next-env.d.ts`, `vitest.config.ts`, `vitest.setup.ts` — project + test config
- `app/layout.tsx`, `app/globals.css` — shell
- `app/page.tsx` — showcase page (state + fetch)
- `app/api/records/route.ts` — HTTP contract
- `lib/datasource/types.ts` — `CatalogRecord`, `ColumnDef`, `ListParams`, `DataSource`
- `lib/datasource/columns.ts` — `CATALOG_COLUMNS`
- `lib/datasource/json.ts` — `JsonDataSource`
- `lib/datasource/index.ts` — `getDataSource()`
- `data/catalog.json` — real seed records
- `components/MindSheet/MindSheet.tsx` — controlled table
- Tests: `lib/datasource/json.test.ts`, `lib/datasource/seed.test.ts`, `app/api/records/route.test.ts`, `components/MindSheet/MindSheet.test.tsx`

---

### Task 1: Scaffold app + test runner

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `next-env.d.ts`, `vitest.config.ts`, `vitest.setup.ts`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder)
- Test: `smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working Next.js app and a runnable `npm test` (Vitest, jsdom).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ai-researcher",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.5.20",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.js` and `next-env.d.ts`**

`next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

`next-env.d.ts`:
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 4: Create `vitest.config.ts` and `vitest.setup.ts`**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
});
```

`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Create app shell**

`app/layout.tsx`:
```tsx
import './globals.css';

export const metadata = { title: 'AI-Researcher' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

`app/globals.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; color: #1c2030; background: #f7f8fb; }
```

`app/page.tsx` (placeholder, replaced in Task 5):
```tsx
export default function Home() {
  return <main style={{ padding: 24 }}><h1>AI-Researcher</h1></main>;
}
```

- [ ] **Step 6: Write the smoke test**

`smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and run**

Run: `npm install`
Run: `npm test`
Expected: 1 passed (`smoke.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold ai-researcher Next.js app with vitest"
```

---

### Task 2: DataSource layer (types, columns, JsonDataSource)

**Files:**
- Create: `lib/datasource/types.ts`, `lib/datasource/columns.ts`, `lib/datasource/json.ts`
- Test: `lib/datasource/json.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Cell = string | number | null`
  - `interface CatalogRecord { id: string; [field: string]: Cell }`
  - `type ColumnType = 'text' | 'number' | 'long-text' | 'url' | 'select'`
  - `interface ColumnDef { key: string; label: string; type: ColumnType; sortable?: boolean; filterable?: boolean }`
  - `interface ListParams { sort?: { key: string; dir: 'asc' | 'desc' }; filter?: { key: string; value: string } }`
  - `interface DataSource { columns(): Promise<ColumnDef[]>; list(params?: ListParams): Promise<CatalogRecord[]> }`
  - `const CATALOG_COLUMNS: ColumnDef[]`
  - `class JsonDataSource implements DataSource` with `constructor(records: CatalogRecord[], columns: ColumnDef[])`

- [ ] **Step 1: Create `lib/datasource/types.ts`**

```ts
export type Cell = string | number | null;

export interface CatalogRecord {
  id: string;
  [field: string]: Cell;
}

export type ColumnType = 'text' | 'number' | 'long-text' | 'url' | 'select';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  sortable?: boolean;
  filterable?: boolean;
}

export interface ListParams {
  sort?: { key: string; dir: 'asc' | 'desc' };
  filter?: { key: string; value: string };
}

export interface DataSource {
  columns(): Promise<ColumnDef[]>;
  list(params?: ListParams): Promise<CatalogRecord[]>;
}
```

- [ ] **Step 2: Create `lib/datasource/columns.ts`**

```ts
import type { ColumnDef } from './types';

export const CATALOG_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  { key: 'url', label: 'Сайт', type: 'url' },
  { key: 'region', label: 'Регион', type: 'select', sortable: true, filterable: true },
  { key: 'country', label: 'Страна', type: 'text', sortable: true },
  { key: 'vertical', label: 'Вертикаль', type: 'select', sortable: true, filterable: true },
  { key: 'founded', label: 'Основана', type: 'number', sortable: true },
  { key: 'description', label: 'Описание', type: 'long-text' },
  { key: 'products', label: 'Продукты', type: 'long-text' },
  { key: 'pricing', label: 'Цены', type: 'text' },
  { key: 'plans_detail', label: 'Тарифы', type: 'long-text' },
  { key: 'traction', label: 'Трекшн', type: 'text' },
  { key: 'grade', label: 'Грейд', type: 'select', sortable: true, filterable: true },
  { key: 'idea_for_ais', label: 'Идея для AiS', type: 'long-text' },
  { key: 'tasks', label: 'Задачи', type: 'long-text' },
  { key: 'howto', label: 'Как применить', type: 'long-text' },
  { key: 'reddit', label: 'Reddit', type: 'long-text' },
];
```

- [ ] **Step 3: Write the failing test for `JsonDataSource`**

`lib/datasource/json.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { JsonDataSource } from './json';
import type { CatalogRecord, ColumnDef } from './types';

const columns: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  { key: 'region', label: 'Регион', type: 'select', sortable: true, filterable: true },
  { key: 'founded', label: 'Основана', type: 'number', sortable: true },
];

const records: CatalogRecord[] = [
  { id: 'b', name: 'Beta', region: 'US', founded: 2020 },
  { id: 'a', name: 'Alpha', region: 'EU', founded: 2017 },
  { id: 'c', name: 'Gamma', region: 'EU', founded: 2019 },
];

const ds = () => new JsonDataSource(records, columns);

describe('JsonDataSource', () => {
  it('returns the provided columns', async () => {
    expect(await ds().columns()).toEqual(columns);
  });

  it('lists all records unsorted when no params', async () => {
    const r = await ds().list();
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts text ascending', async () => {
    const r = await ds().list({ sort: { key: 'name', dir: 'asc' } });
    expect(r.map((x) => x.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts text descending', async () => {
    const r = await ds().list({ sort: { key: 'name', dir: 'desc' } });
    expect(r.map((x) => x.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts numbers numerically, not lexically', async () => {
    const r = await ds().list({ sort: { key: 'founded', dir: 'asc' } });
    expect(r.map((x) => x.founded)).toEqual([2017, 2019, 2020]);
  });

  it('filters by exact select value', async () => {
    const r = await ds().list({ filter: { key: 'region', value: 'EU' } });
    expect(r.map((x) => x.id).sort()).toEqual(['a', 'c']);
  });

  it('applies filter then sort together', async () => {
    const r = await ds().list({
      filter: { key: 'region', value: 'EU' },
      sort: { key: 'founded', dir: 'desc' },
    });
    expect(r.map((x) => x.id)).toEqual(['c', 'a']);
  });

  it('treats null cells as last when sorting ascending', async () => {
    const withNull = new JsonDataSource(
      [
        { id: '1', name: 'X', region: null, founded: null },
        { id: '2', name: 'Y', region: 'EU', founded: 2018 },
      ],
      columns,
    );
    const r = await withNull.list({ sort: { key: 'founded', dir: 'asc' } });
    expect(r.map((x) => x.id)).toEqual(['2', '1']);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run lib/datasource/json.test.ts`
Expected: FAIL — cannot find module `./json` / `JsonDataSource` is not defined.

- [ ] **Step 5: Implement `lib/datasource/json.ts`**

```ts
import type { CatalogRecord, ColumnDef, DataSource, ListParams } from './types';

export class JsonDataSource implements DataSource {
  constructor(
    private readonly records: CatalogRecord[],
    private readonly cols: ColumnDef[],
  ) {}

  async columns(): Promise<ColumnDef[]> {
    return this.cols;
  }

  async list(params?: ListParams): Promise<CatalogRecord[]> {
    let rows = [...this.records];

    if (params?.filter) {
      const { key, value } = params.filter;
      rows = rows.filter((r) => String(r[key] ?? '') === value);
    }

    if (params?.sort) {
      const { key, dir } = params.sort;
      const isNumber = this.cols.find((c) => c.key === key)?.type === 'number';
      rows.sort((a, b) => compare(a[key], b[key], isNumber, dir));
    }

    return rows;
  }
}

function compare(
  a: CatalogRecord[string],
  b: CatalogRecord[string],
  isNumber: boolean,
  dir: 'asc' | 'desc',
): number {
  const factor = dir === 'asc' ? 1 : -1;
  // nulls always sort to the end regardless of direction
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return 1 * -1 * -1; // b null → a first
  if (isNumber) return (Number(a) - Number(b)) * factor;
  return String(a).localeCompare(String(b), 'ru') * factor;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/datasource/json.test.ts`
Expected: PASS (8 tests). If the null-ordering test fails, fix `compare` so that when `b === null` and `a !== null`, `a` comes first (return -1).

- [ ] **Step 7: Commit**

```bash
git add lib/datasource
git commit -m "feat: DataSource interface and in-memory JsonDataSource with sort/filter"
```

---

### Task 3: Real seed + `getDataSource()`

**Files:**
- Create: `data/catalog.json`, `lib/datasource/index.ts`
- Test: `lib/datasource/seed.test.ts`

**Interfaces:**
- Consumes: `JsonDataSource`, `CATALOG_COLUMNS`, `CatalogRecord`.
- Produces: `function getDataSource(): DataSource`.

- [ ] **Step 1: Create `data/catalog.json` with real records**

Start from the one fully-captured record (Synthesia) and append the others already captured in the catalog preview. Every object MUST have an `id` (slug of `name`) plus the 16 catalog fields; use only real captured values — do not invent pricing/traction/etc. The full 993 KB catalog replaces this file verbatim later (just add `id`s).

Minimum seed content (real — Synthesia captured in full):
```json
[
  {
    "id": "synthesia",
    "name": "Synthesia",
    "url": "https://www.synthesia.io",
    "region": "EU",
    "country": "Великобритания",
    "vertical": "video",
    "founded": 2017,
    "description": "B2B-платформа для создания корпоративных видео с AI-аватарами по тексту: обучение, онбординг, коммуникации. Видео на 140+ языках без пересъёмки.",
    "products": "AI-аватары, генерация видео из текста, перевод/дубляж 130+ языков, AI-озвучка",
    "pricing": "Personal $22/мес; кастомный аватар +$1000/год; Enterprise по запросу",
    "plans_detail": "Basic: бесплатно, 10 мин видео/мес, 9 стоковых аватаров; Starter $29/мес (или $18/мес при годовой), 120 мин/год, 125+ аватаров + 3 личных; Creator $89/мес (или $64/мес годовая), 360 мин/год, 180+ аватаров + 5 личных, API; Enterprise: по запросу, безлимит, 240+ аватаров, SAML/SSO, SCORM",
    "traction": "$330M привлечено; оценка $4B; 60 000 компаний",
    "grade": "E1",
    "idea_for_ais": "Фабрика корпоративных видео с библиотекой кастомных аватаров клиентов; монетизация 'аватар как подписка'",
    "tasks": "Создание обучающих и корпоративных видео с AI-аватарами без съёмочной группы; озвучка на 140+ языках; one-click перевод/локализация видео на 80+ языков",
    "howto": "Загружаешь сценарий/текст, выбираешь аватар и язык, генерируешь готовый ролик.",
    "reddit": "Корпоративный фаворит для обучающих видео: хвалят за стабильный lip-sync"
  }
]
```

Then append the remaining captured records (HeyGen, Runway, Luma AI, Pika Labs, Higgsfield AI, Captions, Arcads, Creatify, Argil, Colossyan, D-ID, Tavus, ElevenLabs) by extracting each object's real fields from the captured catalog preview saved at:
`C:\Users\nehoc\.claude\projects\C--Users-nehoc-session--claude\a4fff334-1c33-4424-8192-82dd72e031d4\tool-results\toolu_01BjkvUAQ1uP4HaeJtoamRGp.json` (the `text` field holds the escaped catalog array; unescape `\"`, `\\n`, `\(`→`(`, take the JSON array, and add an `id` slug per record). If that file is unavailable at execution time, ship the Synthesia record alone and note in the commit that the full catalog drops in later — do NOT fabricate records.

- [ ] **Step 2: Write the failing seed test**

`lib/datasource/seed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import catalog from '@/data/catalog.json';
import { CATALOG_COLUMNS } from './columns';

describe('catalog seed', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('every record has an id and all declared column keys', () => {
    const keys = CATALOG_COLUMNS.map((c) => c.key);
    for (const rec of catalog as Record<string, unknown>[]) {
      expect(typeof rec.id).toBe('string');
      for (const k of keys) {
        expect(rec).toHaveProperty(k);
      }
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/datasource/seed.test.ts`
Expected: FAIL — `@/data/catalog.json` missing, or a record lacks a column key. Fix the seed until every record carries all 16 keys + `id`.

- [ ] **Step 4: Implement `lib/datasource/index.ts`**

```ts
import catalog from '@/data/catalog.json';
import { JsonDataSource } from './json';
import { CATALOG_COLUMNS } from './columns';
import type { CatalogRecord, DataSource } from './types';

// DATA_SOURCE is reserved for a future 'supabase' adapter; JSON is the default.
export function getDataSource(): DataSource {
  return new JsonDataSource(catalog as CatalogRecord[], CATALOG_COLUMNS);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/datasource`
Expected: PASS (seed tests + Task 2 tests all green).

- [ ] **Step 6: Commit**

```bash
git add data/catalog.json lib/datasource/index.ts lib/datasource/seed.test.ts
git commit -m "feat: real catalog seed and getDataSource() adapter selector"
```

---

### Task 4: `GET /api/records` route

**Files:**
- Create: `app/api/records/route.ts`
- Test: `app/api/records/route.test.ts`

**Interfaces:**
- Consumes: `getDataSource()`.
- Produces: `GET(request: Request): Promise<Response>` returning JSON `{ columns: ColumnDef[]; records: CatalogRecord[] }`. Query params: `sortKey`, `sortDir` (`asc`|`desc`), `filterKey`, `filterValue`.

- [ ] **Step 1: Write the failing route test**

`app/api/records/route.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GET } from './route';

function call(url: string) {
  return GET(new Request(url));
}

describe('GET /api/records', () => {
  it('returns columns and records', async () => {
    const res = await call('http://localhost/api/records');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.columns)).toBe(true);
    expect(body.columns.length).toBe(16);
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records.length).toBeGreaterThan(0);
  });

  it('applies sort params', async () => {
    const res = await call('http://localhost/api/records?sortKey=name&sortDir=asc');
    const body = await res.json();
    const names = body.records.map((r: { name: string }) => r.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ru'));
    expect(names).toEqual(sorted);
  });

  it('applies filter params', async () => {
    const res = await call(
      'http://localhost/api/records?filterKey=region&filterValue=EU',
    );
    const body = await res.json();
    for (const r of body.records) expect(r.region).toBe('EU');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/records/route.test.ts`
Expected: FAIL — cannot find `./route` / `GET` is not defined.

- [ ] **Step 3: Implement `app/api/records/route.ts`**

```ts
import { getDataSource } from '@/lib/datasource';
import type { ListParams } from '@/lib/datasource/types';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params: ListParams = {};

  const sortKey = url.searchParams.get('sortKey');
  const sortDir = url.searchParams.get('sortDir');
  if (sortKey) {
    params.sort = { key: sortKey, dir: sortDir === 'desc' ? 'desc' : 'asc' };
  }

  const filterKey = url.searchParams.get('filterKey');
  const filterValue = url.searchParams.get('filterValue');
  if (filterKey && filterValue) {
    params.filter = { key: filterKey, value: filterValue };
  }

  const ds = getDataSource();
  const [columns, records] = await Promise.all([ds.columns(), ds.list(params)]);
  return Response.json({ columns, records });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/records/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/records/route.ts app/api/records/route.test.ts
git commit -m "feat: GET /api/records with sort and filter query params"
```

---

### Task 5: `MindSheet` component

**Files:**
- Create: `components/MindSheet/MindSheet.tsx`
- Test: `components/MindSheet/MindSheet.test.tsx`

**Interfaces:**
- Consumes: `ColumnDef`, `CatalogRecord`, `ListParams` from `@/lib/datasource/types`.
- Produces: default export `MindSheet` — a **controlled** component:
```ts
interface MindSheetProps {
  columns: ColumnDef[];
  records: CatalogRecord[];
  sort?: ListParams['sort'];
  filter?: ListParams['filter'];
  onSortChange: (key: string) => void;
  onFilterChange: (filter: ListParams['filter']) => void;
}
```
Clicking a sortable header calls `onSortChange(key)`. Each `filterable` column renders a `<select>` of its distinct values (plus «Все»); selecting calls `onFilterChange({key, value})`, «Все» calls `onFilterChange(undefined)`.

- [ ] **Step 1: Write the failing component test**

`components/MindSheet/MindSheet.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MindSheet from './MindSheet';
import type { CatalogRecord, ColumnDef } from '@/lib/datasource/types';

const columns: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  { key: 'region', label: 'Регион', type: 'select', sortable: true, filterable: true },
];
const records: CatalogRecord[] = [
  { id: 'a', name: 'Alpha', region: 'EU' },
  { id: 'b', name: 'Beta', region: 'US' },
];

describe('MindSheet', () => {
  it('renders a header per column and a row per record', () => {
    render(
      <MindSheet columns={columns} records={records}
        onSortChange={() => {}} onFilterChange={() => {}} />,
    );
    expect(screen.getByRole('columnheader', { name: /Название/ })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('calls onSortChange when a sortable header is clicked', () => {
    const onSortChange = vi.fn();
    render(
      <MindSheet columns={columns} records={records}
        onSortChange={onSortChange} onFilterChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Название/ }));
    expect(onSortChange).toHaveBeenCalledWith('name');
  });

  it('calls onFilterChange with the selected value', () => {
    const onFilterChange = vi.fn();
    render(
      <MindSheet columns={columns} records={records}
        onSortChange={() => {}} onFilterChange={onFilterChange} />,
    );
    fireEvent.change(screen.getByLabelText(/Фильтр Регион/), { target: { value: 'US' } });
    expect(onFilterChange).toHaveBeenCalledWith({ key: 'region', value: 'US' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/MindSheet/MindSheet.test.tsx`
Expected: FAIL — cannot find `./MindSheet`.

- [ ] **Step 3: Implement `components/MindSheet/MindSheet.tsx`**

```tsx
'use client';

import type { CatalogRecord, ColumnDef, ListParams } from '@/lib/datasource/types';

interface MindSheetProps {
  columns: ColumnDef[];
  records: CatalogRecord[];
  sort?: ListParams['sort'];
  filter?: ListParams['filter'];
  onSortChange: (key: string) => void;
  onFilterChange: (filter: ListParams['filter']) => void;
}

function distinct(records: CatalogRecord[], key: string): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const v = r[key];
    if (v !== null && v !== undefined && v !== '') set.add(String(v));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

export default function MindSheet({
  columns, records, sort, filter, onSortChange, onFilterChange,
}: MindSheetProps) {
  const filterables = columns.filter((c) => c.filterable);

  return (
    <div>
      {filterables.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {filterables.map((c) => (
            <label key={c.key} style={{ fontSize: 13 }}>
              {c.label}:{' '}
              <select
                aria-label={`Фильтр ${c.label}`}
                value={filter?.key === c.key ? filter.value : ''}
                onChange={(e) =>
                  onFilterChange(
                    e.target.value ? { key: c.key, value: e.target.value } : undefined,
                  )
                }
              >
                <option value="">Все</option>
                {distinct(records, c.key).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  role="columnheader"
                  style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #dfe3ee', whiteSpace: 'nowrap' }}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(c.key)}
                      style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', padding: 0 }}
                    >
                      {c.label}
                      {sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f6', maxWidth: c.type === 'long-text' ? 320 : undefined, verticalAlign: 'top' }}
                  >
                    {renderCell(r[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(value: CatalogRecord[string], col: ColumnDef) {
  if (value === null || value === undefined || value === '') return '—';
  if (col.type === 'url') {
    return <a href={String(value)} target="_blank" rel="noreferrer">{String(value)}</a>;
  }
  return String(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/MindSheet/MindSheet.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/MindSheet
git commit -m "feat: controlled MindSheet table with sortable headers and filters"
```

---

### Task 6: Wire the page + browser verification

**Files:**
- Modify: `app/page.tsx` (replace placeholder)
- Test: manual browser verification (dev server)

**Interfaces:**
- Consumes: `GET /api/records`, `MindSheet`, `ColumnDef`, `CatalogRecord`, `ListParams`.
- Produces: the working showcase page.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import MindSheet from '@/components/MindSheet/MindSheet';
import type { CatalogRecord, ColumnDef, ListParams } from '@/lib/datasource/types';

export default function Home() {
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [sort, setSort] = useState<ListParams['sort']>();
  const [filter, setFilter] = useState<ListParams['filter']>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (sort) { qs.set('sortKey', sort.key); qs.set('sortDir', sort.dir); }
    if (filter) { qs.set('filterKey', filter.key); qs.set('filterValue', filter.value); }
    setLoading(true);
    fetch(`/api/records?${qs.toString()}`)
      .then((r) => r.json())
      .then((body) => { setColumns(body.columns); setRecords(body.records); })
      .finally(() => setLoading(false));
  }, [sort, filter]);

  const onSortChange = useCallback((key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22 }}>База знаний · Продукты и конкуренты</h1>
      <p style={{ color: '#6b7290', fontSize: 14 }}>
        {loading ? 'Загрузка…' : `${records.length} записей`}
      </p>
      <MindSheet
        columns={columns}
        records={records}
        sort={sort}
        filter={filter}
        onSortChange={onSortChange}
        onFilterChange={setFilter}
      />
    </main>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all suites pass (smoke, json, seed, route, MindSheet).

- [ ] **Step 3: Start the dev server and verify in the browser**

Run: `npm run dev` (via the preview tooling: `preview_start {name}` after adding a `.claude/launch.json` entry, port 3000).
Verify:
- Page shows «База знаний · Продукты и конкуренты» and the record count.
- Table renders all 16 columns and every seed record.
- Clicking «Название» sorts asc, clicking again sorts desc (arrow flips).
- Region/Vertical/Grade filters narrow the rows.
- No console errors (`read_console_messages`).
Capture a screenshot as proof.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: catalog showcase page wired to /api/records"
```

---

## Self-Review

**Spec coverage:**
- §2 `DataSource` abstraction → Task 2 (interface) + Task 3 (`getDataSource`). ✓
- §3 modules → Tasks 2–6 cover every listed module. ✓
- §4 contracts (`DataSource`, `ColumnDef`, API shape) → Tasks 2, 4. ✓
- §5 data model (16 columns, real seed) → Task 2 (`CATALOG_COLUMNS`) + Task 3 (seed). ✓
- §6 data flow (server sort/filter) → Task 2 (in adapter) + Task 4 (params) + Task 6 (UI state). ✓
- §7 out-of-scope respected — no writes/MCP/Supabase/auth/tree. ✓
- §8 testing (unit datasource, API contract, UI, browser) → Tasks 2,3,4,5,6. ✓
- §9 stack (Next App Router, TS, Vitest, no UI libs) → Task 1. ✓

**Placeholder scan:** No TBD/TODO. The seed step names an exact extraction source and forbids fabrication rather than leaving data vague. All code steps show full code.

**Type consistency:** `CatalogRecord`, `ColumnDef`, `ListParams`, `DataSource` used identically across Tasks 2/3/4/5/6. `getDataSource()`, `JsonDataSource(records, columns)`, `GET(request)` signatures match between producer and consumer tasks. `onSortChange(key)` / `onFilterChange(filter)` match between Task 5 and Task 6. `Response.json` shape `{columns, records}` matches the route test and the page fetch.

Note: spec §4 named the row type `Record`; the plan uses `CatalogRecord` to avoid shadowing TypeScript's built-in `Record<K,V>` utility. Intentional, applied consistently.
