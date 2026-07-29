# AI-Researcher — Витрина каталога (срез 1) · Design

- **Дата:** 2026-07-29
- **Проект:** `ai-researcher` (новое отдельное Next.js-приложение)
- **Срез:** первый вертикальный слой — read-only витрина каталога «Продукты/Конкуренты» (БД → API → mind-sheet)
- **Опирается на:** `scope_ai_researcher.html`, `build-plan.html`, `data-model.md` (папка `Downloads/ai-researcher/`)

---

## 1. Контекст и цель

AI-Researcher проводит исследования поверх растущей базы знаний, а не с нуля. Полный продукт — многофазный (см. `build-plan.html`, фазы 0–6 + vision). **Этот спек описывает только первый срез**: показать реальные данные каталога в универсальном mind-sheet, доказав связку **источник данных → API → UI**.

Две части уже существуют как код и переиспользуются концептуально:
- `ai-research` — движок deep-research (пайплайн + Supabase-кэш). В этом срезе **не трогаем**.
- `fathom-soritng` — зрелый дашборд с mind-sheet UI, динамическими колонками, MCP. Берём **паттерн** mind-sheet, но не форкаем репозиторий.

Решения (согласованы с пользователем):
- Отдельное приложение `ai-researcher`, не расширение чужих репозиториев.
- Первый срез — витрина каталога, read-only.
- Данные на старте — локальный JSON; Supabase подключается позже за тем же интерфейсом.

## 2. Архитектура

> **Обновление (по требованию Александра «universal UI»):** mind-sheet — **переносимый самодостаточный UI-пакет** (`packages/mindsheet`), который любой сайт импортирует (Fathom, Researcher, будущие). Компонент не знает ни про источник данных, ни про host-приложение — только пропсы (`ColumnDef[]`, строки, обработчики sort/filter). Слой `DataSource` остаётся на стороне host-приложения. «Один UI → любые сайты»: правка пакета применяется во всех потребителях.

Единственная ключевая абстракция данных — интерфейс `DataSource`. UI и API про конкретный источник не знают. Пакет `mindsheet` определяет СВОИ типы UI-контракта (`ColumnDef`, `Row`) и не импортирует ничего из host-приложения; типы `DataSource` структурно совместимы с ними.

```
mind-sheet UI  →  GET /api/records  →  DataSource
                                         ├── JsonDataSource     (сейчас)
                                         └── SupabaseDataSource (позже, та же форма)
```

Смена источника = смена одного адаптера через env-переменную. UI и контракт API не меняются.

## 3. Модули и границы

| Модуль | Назначение | Зависит от |
|---|---|---|
| `data/catalog.json` | Seed-данные (реальные записи каталога) | — |
| `lib/datasource/types.ts` | Типы `Record`, `ColumnDef`, интерфейс `DataSource` | — |
| `lib/datasource/json.ts` | `JsonDataSource` — читает seed, отдаёт записи+колонки, применяет sort/filter | types, catalog.json |
| `lib/datasource/index.ts` | Выбор адаптера по `DATA_SOURCE` env (default: json) | json.ts |
| `app/api/records/route.ts` | HTTP-контракт: отдаёт записи и колонки, принимает sort/filter | datasource/index |
| `components/MindSheet/*` | Таблица: динамические колонки, сортировка, фильтр | тип `ColumnDef` |
| `app/page.tsx` | Страница витрины, тянет `/api/records` | MindSheet |

Правило: **колонки декларативны** (`ColumnDef[]`). Новая колонка добавляется данными, без правки компонента.

## 4. Контракты (интерфейсы)

```ts
// lib/datasource/types.ts
export type Cell = string | number | null;
export type Record = { id: string } & { [field: string]: Cell };

export type ColumnDef = {
  key: string;          // 'name', 'region', ...
  label: string;        // человекочитаемое
  type: 'text' | 'number' | 'long-text' | 'url' | 'select';
  sortable?: boolean;
  filterable?: boolean;
};

export type ListParams = {
  sort?: { key: string; dir: 'asc' | 'desc' };
  filter?: { key: string; value: string };  // одиночный фильтр в этом срезе
};

export interface DataSource {
  columns(): Promise<ColumnDef[]>;
  list(params?: ListParams): Promise<Record[]>;
}
```

```
GET /api/records?sortKey=name&sortDir=asc&filterKey=region&filterValue=EU
200 → { columns: ColumnDef[], records: Record[] }
```

## 5. Модель данных (реальная схема каталога)

Из `ai-products-catalog.json` (см. `data-model.md`). Поля = `ColumnDef`:

`name` · `url` · `region` · `country` · `vertical` · `founded` · `description` · `products` · `pricing` · `plans_detail` · `traction` · `grade` · `idea_for_ais` · `tasks` · `howto` · `reddit`

Типы: `region`/`vertical`/`grade` → `select` (filterable); `founded` → `number`; `description`/`products`/`plans_detail`/`tasks`/`howto`/`idea_for_ais`/`reddit` → `long-text`; `url` → `url`; остальное → `text`.

Seed: стартуем с ~14 записей, вытащенных из превью каталога (Synthesia, HeyGen, Runway, ElevenLabs, D-ID, Tavus и др.). Полный файл (993 КБ) подставляется в `catalog.json` без изменений кода, когда будет доступен.

## 6. Поток данных

1. `page.tsx` (client) запрашивает `GET /api/records` с текущими sort/filter.
2. Route создаёт `DataSource` через `lib/datasource/index`, зовёт `columns()` и `list(params)`.
3. `JsonDataSource` читает `catalog.json`, применяет sort/filter в памяти, возвращает.
4. `MindSheet` рендерит колонки по `ColumnDef`, строки по `Record`; клики по заголовкам меняют sort, контролы — filter.

Sort/filter выполняются на сервере (в адаптере) — чтобы при переходе на Supabase логика ушла в SQL без изменения UI.

## 7. Вне охвата (YAGNI для среза 1)

Не делаем: движок/поиск, MCP-коннектор, запись в базу, Supabase, авторизацию, 3-уровневое дерево-группировку, редактирование ячеек, инструкционные карточки (второй контент-модель), уведомления. Всё это — последующие фазы `build-plan.html`.

## 8. Тестирование

- **TDD, юнит:** `JsonDataSource` — загрузка seed, корректность `columns()`, сортировка (asc/desc, числа vs строки), фильтр по `select`-полю, устойчивость к пустым значениям.
- **API-контракт:** `/api/records` возвращает `{columns, records}` нужной формы; параметры sort/filter применяются.
- **UI:** проверка на dev-сервере через браузер — витрина рендерит реальные данные, сортировка и фильтр работают; скриншот как пруф.

## 9. Стек

Next.js (App Router) + React + TypeScript. Без внешних UI-библиотек в этом срезе (своя лёгкая таблица). Тест-раннер — `vitest` (или `node:test` + `tsx`, решается в плане).

## 10. Предпосылка (не блокирует срез 1)

Фаза 0 плана — согласование архитектуры с Александром. Срез 1 намеренно построен так, чтобы быть **обратимым и полезным при любом его решении**: read-only витрина реальных данных за абстракцией `DataSource`. Даже если позже поменяется бэкенд-стратегия — UI, контракт и seed переиспользуются.
