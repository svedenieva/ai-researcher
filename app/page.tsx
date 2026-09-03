'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MindSheet } from '@aivocado/mindsheet';
import type { CellFormat } from '@aivocado/mindsheet';
import type { CatalogRecord, ColumnDef, ListParams } from '@/lib/datasource/types';
import { CATALOG_COLUMNS } from '@/lib/datasource/columns';
import { BASES, DEFAULT_BASE } from '@/lib/datasource/bases';
import ThemeToggle from './theme-toggle';
import LangSwitch from './lang-switch';
import CreateBase from './create-base';
import BaseTree from './base-tree';
import BaseAiActions from './base-ai-actions';
import BaseSummary from './base-summary';
import SavedViews from './saved-views';
import GlobalSearch from './global-search';
import Shortcuts from './shortcuts';
import { useLang } from './lang-provider';
import { t as tr, mindsheetStrings } from '@/lib/i18n';
import { toneColor } from '@/lib/tone';
import { recordsQuery } from '@/lib/records-query';
import { MODE_RESEARCH, MODE_REFERENCE } from '@/lib/mode';
import { basePath } from '@/lib/datasource/tree';
import { defaultGroupSort } from '@/lib/presets';
import { apiJson, apiSend } from '@/lib/api';
import { useToast, useConfirm } from './ui';
import { IconGlobe, IconMerge, IconFile, IconShare, IconGrid, IconPlug, IconInbox, IconTrash, IconSidebar, IconUpload, IconScrape } from './icons';

import styles from './page.module.css';

const DEFAULT_SORT = { key: 'pop', dir: 'asc' as const };

const FILTER_KEYS = new Set(CATALOG_COLUMNS.filter((c) => c.filterable).map((c) => c.key));
const BUILTIN_IDS = new Set(BASES.map((b) => b.id));
// URL params that steer navigation, not filtering — never read as filters
const NAV_PARAMS = new Set(['base', 'q', 'sort']);

interface BaseTab {
  id: string;
  name: string;
  tone: string;
  builtin: boolean;
  parent: string | null;
}

const BUILTIN_TABS: BaseTab[] = BASES.map((b) => ({ id: b.id, name: b.name, tone: b.tone, builtin: true, parent: null }));

export default function Home() {
  const router = useRouter();
  const { lang } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  // logo image with a graceful fallback to the "AiR" monogram if public/logo.png is absent
  const [logoOk, setLogoOk] = useState(true);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [total, setTotal] = useState<number>();
  const [facets, setFacets] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<ListParams['sort']>(DEFAULT_SORT);
  // extra grouping levels (Shift + click), at most 2 beyond the first
  const [extraLevels, setExtraLevels] = useState<NonNullable<ListParams['sort']>[]>([]);
  // columns to GROUP by — independent of sort order (Google-Sheets style)
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  // view mode: 'all' | MODE_RESEARCH | MODE_REFERENCE — filters rows by the
  // system «Режим» column; default shows everything
  const [mode, setMode] = useState('all');
  const [base, setBase] = useState<string>(DEFAULT_BASE);
  const [tabs, setTabs] = useState<BaseTab[]>(BUILTIN_TABS);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [creating, setCreating] = useState(false);
  // when the create form is opened from a node's «+», that node preselects the
  // parent, so a base lands where you clicked
  const [createParent, setCreateParent] = useState<string | undefined>(undefined);
  // favorite sources of the current base
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  // desktop «rail» mode: the sidebar collapses to a narrow icon strip (section
  // icons only, tree/search hidden). Persisted; only affects screens ≥1025px.
  const [rail, setRail] = useState(false);
  useEffect(() => {
    try { setRail(localStorage.getItem('sideRail') === '1'); } catch {}
  }, []);
  const toggleRail = useCallback(() => {
    setRail((v) => {
      const n = !v;
      try { localStorage.setItem('sideRail', n ? '1' : '0'); } catch {}
      return n;
    });
  }, []);
  // hidden file input for «import .md/.csv back into this base» (the export's inverse)
  const importInputRef = useRef<HTMLInputElement>(null);
  // apply a base's default grouping (e.g. «Стадия» for the «Внедрение» preset)
  // once when the base is entered, then leave sorting to the user
  const pendingDefaultGroup = useRef(true);
  // on phones and tablets/small laptops the sidebar is an overlay — start it
  // collapsed so the table (and its toolbar) get the full width; the hamburger
  // slides it in on demand. Must match the off-canvas breakpoint in the CSS.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches) setSideOpen(false);
  }, []);

  const isCustom = !BUILTIN_IDS.has(base);

  // numeric columns are coerced to a number before saving
  const coerce = useCallback(
    (key: string, value: string): string | number => {
      const col = columns.find((c) => c.key === key);
      return col?.type === 'number' && value !== '' ? Number(value) : value;
    },
    [columns],
  );

  const onCellEdit = useCallback(
    (record: CatalogRecord, key: string, value: string) => {
      // a row pulled in from a nested base carries its real base in __baseId;
      // edit it THERE, or the PATCH won't find the row in the parent and the
      // change is silently lost
      const targetBase = typeof record.__baseId === 'string' ? record.__baseId : base;
      apiSend('/api/records', 'PATCH', { base: targetBase, id: record.id, data: { [key]: coerce(key, value) } })
        .then(() => setRefreshTick((t) => t + 1))
        .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося зберегти'));
    },
    [base, coerce, toast],
  );

  // Поклеточное форматирование (жирный/размер) живёт в самой записи под __fmt
  // (jsonb, без миграции): ключ колонки → { bold?, fontScale? }.
  const cellFormats = useMemo(() => {
    const map: Record<string, Record<string, CellFormat>> = {};
    for (const r of records) {
      const f = (r as Record<string, unknown>).__fmt;
      if (f && typeof f === 'object') map[String(r.id)] = f as Record<string, CellFormat>;
    }
    return map;
  }, [records]);

  const onCellFormat = useCallback(
    (rowIds: string[], colKeys: string[], patch: CellFormat) => {
      const ids = new Set(rowIds);
      const nextFmt = (rec: CatalogRecord): Record<string, CellFormat> => {
        const cur = ((rec as Record<string, unknown>).__fmt ?? {}) as Record<string, CellFormat>;
        const next: Record<string, CellFormat> = { ...cur };
        for (const k of colKeys) {
          const merged: CellFormat = { ...(cur[k] ?? {}), ...patch };
          if (merged.bold === false) delete merged.bold;
          if (merged.italic === false) delete merged.italic;
          if (merged.underline === false) delete merged.underline;
          if (!merged.fontPx) delete merged.fontPx;
          if (merged.fontScale === 1) delete merged.fontScale;
          if (!merged.fontFamily) delete merged.fontFamily;
          if (!merged.color) delete merged.color;
          if (!merged.fill) delete merged.fill;
          if (!merged.align || merged.align === 'left') delete merged.align;
          if (Object.keys(merged).length === 0) delete next[k];
          else next[k] = merged;
        }
        return next;
      };
      // оптимистично — формат виден сразу; параллельно пишем в каждую запись
      const targets = records.filter((r) => ids.has(String(r.id)));
      setRecords((prev) => prev.map((r) => (ids.has(String(r.id)) ? ({ ...(r as Record<string, unknown>), __fmt: nextFmt(r) } as unknown as CatalogRecord) : r)));
      for (const rec of targets) {
        const targetBase = typeof rec.__baseId === 'string' ? rec.__baseId : base;
        apiSend('/api/records', 'PATCH', { base: targetBase, id: rec.id, data: { __fmt: nextFmt(rec) } })
          .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося зберегти формат'));
      }
    },
    [records, base, toast],
  );

  // ТР-МШ-14: массовое присвоение значения выделенным клеткам одной операцией,
  // с отменой. Пишем по одному PATCH на запись (все её изменённые ключи разом),
  // оптимистично применяем и показываем «Отменить» в тосте.
  const applyBulk = useCallback(
    (edits: Array<{ id: string; key: string; value: string }>, announce: boolean) => {
      if (!edits.length) return;
      const byId = new Map(records.map((r) => [String(r.id), r]));
      // снимок прежних значений — для отмены (обратные правки)
      const inverse: Array<{ id: string; key: string; value: string }> = [];
      const perRecord = new Map<string, Record<string, string>>();
      for (const e of edits) {
        const rec = byId.get(e.id);
        if (!rec) continue;
        const prev = rec[e.key];
        inverse.push({ id: e.id, key: e.key, value: prev == null ? '' : String(prev) });
        (perRecord.get(e.id) ?? perRecord.set(e.id, {}).get(e.id)!)[e.key] = e.value;
      }
      // оптимистично применяем к локальным записям
      setRecords((prev) =>
        prev.map((r) => {
          const patch = perRecord.get(String(r.id));
          if (!patch) return r;
          const next: Record<string, unknown> = { ...(r as Record<string, unknown>) };
          for (const [k, v] of Object.entries(patch)) next[k] = coerce(k, v);
          return next as unknown as CatalogRecord;
        }),
      );
      // пишем в БД по одной записи
      for (const [id, patch] of perRecord) {
        const rec = byId.get(id);
        const targetBase = rec && typeof rec.__baseId === 'string' ? rec.__baseId : base;
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) data[k] = coerce(k, v);
        apiSend('/api/records', 'PATCH', { base: targetBase, id, data })
          .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося зберегти'));
      }
      if (announce) {
        toast(`Заполнено: ${perRecord.size} строк`, { action: { label: 'Отменить', onClick: () => applyBulk(inverse, false) } });
      }
    },
    [records, base, coerce, toast],
  );
  const onBulkEdit = useCallback(
    (edits: Array<{ id: string; key: string; value: string }>) => applyBulk(edits, true),
    [applyBulk],
  );

  const onAddRow = useCallback(
    (data: Record<string, string>) => {
      const payload: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(data)) if (v !== '') payload[k] = coerce(k, v);
      apiSend('/api/records', 'POST', { base, data: payload })
        .then(() => setRefreshTick((t) => t + 1))
        .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося додати рядок'));
    },
    [base, coerce, toast],
  );

  const onDeleteRow = useCallback(
    async (record: CatalogRecord) => {
      // rows pulled in from nested child bases are tagged with __source =
      // the child base's display name — they can only be deleted there, otherwise
      // DELETE won't find the record in the current base and silently deletes nothing
      const currentName = tabs.find((t) => t.id === base)?.name;
      const source = record.__source;
      if (source && currentName && source !== currentName) {
        toast(`Цей рядок видаляйте в його базі: «${source}»`);
        return;
      }
      const ok = await confirm({
        title: 'Видалити рядок?',
        message: 'Рядок поїде в кошик — повернути можна звідти.',
        confirmLabel: 'Видалити',
        danger: true,
      });
      if (!ok) return;
      try {
        await apiSend('/api/records', 'DELETE', { base, ids: [String(record.id)] });
        setRefreshTick((t) => t + 1);
        toast('Рядок видалено');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Не вдалося видалити рядок');
      }
    },
    [base, tabs, toast, confirm],
  );

  // Mechanical source check: fetch every link the rows cite and mark the dead
  // ones. Deliberately says "источник открылся", never "верно" — it cannot
  // judge whether a page supports the row, and must not look like it can.
  const checkLinks = useCallback(async () => {
    setCheckingLinks(true);
    try {
      const r = await apiSend<{
        rows: number; urls: number; dead: number; skipped: number;
        quotesChecked: number; quotesMissing: number; quotesSkipped: number;
      }>('/api/records/check-links', 'POST', { base });
      setRefreshTick((t) => t + 1);
      const linkPart =
        r.urls === 0
          ? 'посилань не знайшлося'
          : r.dead
            ? `посилань: ${r.urls}, битих: ${r.dead}`
            : `посилань: ${r.urls} — усі відкрилися`;
      // the quote check is the honest part: a link can be invented, a quote that
      // isn't on the page is what exposes a made-up row
      const quotePart = r.quotesChecked
        ? r.quotesMissing
          ? `; цитат: ${r.quotesChecked}, немає на сторінці: ${r.quotesMissing} ✗`
          : `; цитати: ${r.quotesChecked} — усі на місці ✓`
        : '';
      const tail = r.skipped ? `; не перевірено посилань: ${r.skipped}` : '';
      toast(`Перевірено — ${linkPart}${quotePart}${tail}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося перевірити посилання');
    } finally {
      setCheckingLinks(false);
    }
  }, [base, toast]);

  // Public read-only link for the base — copy it to the clipboard. Shown only
  // when the server has sharing switched on (RESEARCH_SHARE_SECRET).
  const shareBase = useCallback(async () => {
    try {
      const r = await apiJson<{ url: string }>(`/api/records/share-link?base=${encodeURIComponent(base)}`);
      try {
        await navigator.clipboard.writeText(r.url);
        toast('Публічне посилання скопійовано — доступ лише для перегляду');
      } catch {
        toast(r.url); // clipboard blocked — at least show the link
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося створити посилання');
    }
  }, [base, toast]);

  // Import a .md/.csv/.tsv back INTO the current base — the inverse of the
  // Markdown export. Columns match by label, the base's types are kept, and its
  // rows are replaced by the file (the round-trip: export → edit → import back).
  const importFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    if (!text.trim()) { toast('Порожній файл'); return; }
    const ok = await confirm({
      title: 'Імпортувати у цю базу?',
      message: 'Рядки бази буде замінено вмістом файлу (стовпці — за назвою; типи стовпців зберігаються). Поточні рядки підуть у кошик — звідти можна повернути.',
      confirmLabel: 'Імпортувати',
    });
    if (!ok) return;
    try {
      const r = await apiSend<{ replaced: number; added: number; unmatched?: string[] }>(
        '/api/records/import', 'POST', { base, text },
      );
      setRefreshTick((t) => t + 1);
      const skipped = r.unmatched?.length ? ` · пропущено стовпців: ${r.unmatched.length}` : '';
      toast(`Імпортовано: ${r.added} рядків (замінено ${r.replaced})${skipped}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося імпортувати');
    }
  }, [base, confirm, toast]);

  // Extract rows into this base from a page URL via ScrapeGraphAI (the base's
  // columns are the extraction schema). Off until SCRAPEGRAPHAI_API_KEY is set.
  const scrapeUrl = useCallback(async () => {
    const url = window.prompt('URL сторінки — витягти дані у цю базу (ScrapeGraphAI):');
    if (!url || !url.trim()) return;
    toast('Витягую…');
    try {
      const r = await apiSend<{ added: number }>('/api/records/scrape', 'POST', { base, url: url.trim() });
      setRefreshTick((t) => t + 1);
      toast(`Додано рядків: ${r.added}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося витягнути');
    }
  }, [base, toast]);

  // Merge duplicate rows (same name): fill the kept row's gaps from the copies,
  // send the extras to the bin. Reversible, so a light confirm is enough.
  const dedupe = useCallback(async () => {
    const ok = await confirm({
      title: 'Злити дублі?',
      message:
        'Рядки з однаковою назвою буде злито в один: порожні клітинки заповняться з копій, зайві поїдуть у кошик (звідти можна повернути).',
      confirmLabel: 'Злити',
    });
    if (!ok) return;
    setDeduping(true);
    try {
      const r = await apiSend<{ groups: number; removed: number; filled: number }>(
        '/api/records/dedupe',
        'POST',
        { base },
      );
      setRefreshTick((t) => t + 1);
      toast(
        r.removed
          ? `Злито груп: ${r.groups}, прибрано дублів: ${r.removed}${r.filled ? `, заповнено рядків: ${r.filled}` : ''}`
          : 'Дублів не знайдено',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося злити дублі');
    } finally {
      setDeduping(false);
    }
  }, [base, confirm, toast]);

  const loadBases = useCallback(async () => {
    try {
      const body = await apiJson<{ bases?: BaseTab[] }>('/api/bases');
      if (Array.isArray(body.bases) && body.bases.length) setTabs(body.bases);
    } catch {
      /* keep the built-in tabs */
    }
  }, []);

  // live column management — one route, different actions; after each one
  // we re-read the records (columns come back together with them)
  const columnAction = useCallback(
    (payload: Record<string, unknown>) => {
      apiSend('/api/columns', 'POST', { base, ...payload })
        .then(() => setRefreshTick((t) => t + 1))
        .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося змінити колонку'));
    },
    [base, toast],
  );

  // manual row order: we send the full list of ids in the new order, then
  // re-read (the server returns the rows already in the new order)
  const reorderRows = useCallback(
    (orderedIds: string[]) => {
      apiSend('/api/records/reorder', 'POST', { base, order: orderedIds })
        .then(() => setRefreshTick((t) => t + 1))
        .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося змінити порядок'));
    },
    [base, toast],
  );

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const b = p.get('base');
    if (b) setBase(b);
    const q = p.get('q');
    if (q) setSearch(q);
    const s = p.get('sort');
    if (s) {
      const [key, dir] = s.split(':');
      if (key) setSort({ key, dir: dir === 'desc' ? 'desc' : 'asc' });
    } else if (b && !BUILTIN_IDS.has(b)) {
      // a custom base with no explicit sort in the link — natural
      // order (otherwise the initial DEFAULT_SORT by "pop" would create a phantom group)
      setSort(undefined);
    }
    // Filters arrive as query params keyed by column. For the catalog only the
    // known filterable columns count (FILTER_KEYS). A custom base has its own
    // columns, unknown here at load time, so accept any non-navigation param as
    // a filter — this is what makes a tag/status badge on a topic page a working
    // deep link back into its base, filtered by that value.
    const customBase = Boolean(b && !BUILTIN_IDS.has(b));
    const f: Record<string, string> = {};
    for (const [key, value] of p.entries()) {
      if (NAV_PARAMS.has(key)) continue;
      if (FILTER_KEYS.has(key) || customBase) f[key] = value;
    }
    if (Object.keys(f).length) setFilters(f);
    setReady(true);
    loadBases();
  }, [loadBases]);

  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (base !== DEFAULT_BASE) p.set('base', base);
    if (search.trim()) p.set('q', search.trim());
    for (const [key, value] of Object.entries(filters)) p.set(key, value);
    if (sort && !(sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir)) {
      p.set('sort', `${sort.key}:${sort.dir}`);
    }
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [filters, search, sort, base, ready]);

  useEffect(() => {
    if (!ready) return;
    const qs = recordsQuery({ base, sort, filters, search, mode });
    setLoading(true);
    apiJson<{ columns?: ColumnDef[]; records?: CatalogRecord[]; total?: number; facets?: Record<string, string[]>; warning?: string; sharing?: boolean }>(`/api/records?${qs}`)
      .then((body) => {
        setColumns(body.columns ?? []);
        setRecords(body.records ?? []);
        setTotal(body.total ?? body.records?.length ?? 0);
        setFacets(body.facets ?? {});
        setSharing(!!body.sharing);
        // on entering a base, open it grouped by its default-group column if it
        // has one (the «Внедрение» preset groups by «Стадия» — a process board)
        if (pendingDefaultGroup.current) {
          pendingDefaultGroup.current = false;
          const dg = defaultGroupSort(body.columns ?? []);
          setGroupBy(dg ? [dg.key] : []);
        }
        // the catalog loaded but nested bases didn't — say so instead of
        // quietly showing a shorter table
        if (body.warning) toast(body.warning);
      })
      .catch((e) => {
        // Show nothing rather than the previous base's rows: leaving stale data
        // under a new base's name is how "silently wrong" starts.
        setColumns([]);
        setRecords([]);
        setTotal(0);
        setFacets({});
        toast(e instanceof Error ? e.message : 'Не вдалося завантажити дані');
      })
      .finally(() => setLoading(false));
  }, [sort, filters, search, mode, base, ready, refreshTick, toast]);

  const onSortChange = useCallback((key: string) => {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
    setExtraLevels([]);
  }, []);

  // Click on a header — regular sort (the first grouping level).
  // Shift + click — add/toggle an extra level (up to 3 in total).
  const onSortsChange = useCallback(
    (key: string, additive: boolean) => {
      if (!additive) {
        onSortChange(key);
        return;
      }
      setExtraLevels((prev) => {
        if (sort?.key === key) return prev; // this is already the first level
        const i = prev.findIndex((l) => l.key === key);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { key, dir: next[i].dir === 'asc' ? 'desc' : 'asc' };
          return next;
        }
        return prev.length >= 2 ? prev : [...prev, { key, dir: 'asc' as const }];
      });
    },
    [onSortChange, sort],
  );

  // favorites are per-base: reload when the base changes
  useEffect(() => {
    if (!ready) return;
    apiJson<{ favorites?: string[] }>(`/api/favorites?base=${encodeURIComponent(base)}`)
      .then((b) => setFavorites(Array.isArray(b.favorites) ? b.favorites : []))
      .catch((e) => {
        setFavorites([]);
        toast(e instanceof Error ? e.message : 'Не вдалося завантажити обране');
      });
  }, [base, ready, toast]);

  const onToggleFavorite = useCallback(
    (record: CatalogRecord) => {
      const id = String(record.id);
      // optimistic — the star responds immediately
      setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      apiSend('/api/favorites', 'POST', { base, record: id }).catch((e) => {
        // it failed — roll back
        setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
        toast(e instanceof Error ? e.message : 'Не вдалося зберегти обране');
      });
    },
    [base, toast],
  );

  const onSortReset = useCallback(() => {
    setSort(undefined);
    setExtraLevels([]);
  }, []);

  const onBaseChange = useCallback((id: string) => {
    setBase(id);
    setFilters({});
    setSearch('');
    setCreating(false);
    setFavoritesOnly(false);
    // Custom bases open in natural order (no sorting): this is what makes
    // manual row dragging work, and no phantom group pops up over the "pop"
    // column that doesn't exist in these bases. Built-in catalog slices
    // still open sorted by popularity.
    setSort(BUILTIN_IDS.has(id) ? DEFAULT_SORT : undefined);
    setExtraLevels([]);
    setGroupBy([]);
    pendingDefaultGroup.current = true; // re-apply the base's default grouping
  }, []);


  // "favorites only" filters the already-loaded records
  const shownRecords = favoritesOnly
    ? records.filter((r) => favorites.includes(String(r.id)))
    : records;

  const displayColumns = columns;
  const displayFacets = facets;

  // The export link mirrors the data request — same builder, so the file can't
  // describe a different slice than the screen
  const exportQs = recordsQuery({ base, sort, filters, search, mode });
  // Markdown report — a shareable write-up rather than a table dump
  const reportHref = `/api/records/export?${exportQs ? `${exportQs}&` : ''}format=md`;


  return (
    <div className={`${styles.app} ${sideOpen ? '' : styles.sideClosed} ${rail ? styles.sideRail : ''}`}>
      <Shortcuts />
      {/* ── persistent left sidebar: brand + base tree ── */}
      <aside className={styles.side}>
        <div className={styles.sideHead}>
          {logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.png" alt="AiVocado" className={styles.markImg} onError={() => setLogoOk(false)} />
          ) : (
            <span className={styles.mark} aria-hidden="true">AiR</span>
          )}
          <Link href="/" className={styles.brandName}>AI Researcher</Link>
          {/* desktop only: collapse the sidebar to a narrow icon rail (and back) */}
          <button
            type="button"
            className={styles.railToggle}
            onClick={toggleRail}
            aria-label={rail ? 'Розгорнути панель' : 'Згорнути в смужку'}
            aria-pressed={rail}
            title={rail ? 'Розгорнути панель' : 'Згорнути в смужку'}
          >
            <IconSidebar size={17} />
          </button>
          {/* phone only: a burger inside the open off-canvas sidebar to close it —
              the top-bar burger is hidden behind the panel while it's open */}
          <button
            type="button"
            className={styles.sideBurger}
            onClick={() => setSideOpen(false)}
            aria-label="Згорнути панель"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        <div className={styles.sideBody}>
          <GlobalSearch
            onNavigate={(baseId, query) => {
              onBaseChange(baseId);
              setSearch(query);
            }}
          />
          <BaseTree
            embedded
            tabs={tabs}
            base={base}
            onPick={onBaseChange}
            onClose={() => {}}
            onCreate={(parentId) => { setCreateParent(parentId); setCreating(true); }}
            onMutated={loadBases}
          />
        </div>
        <nav className={styles.sideNav} aria-label="Розділи">
          <Link href="/bases" className={styles.sideNavLink} title={tr(lang, 'showcase')}>
            <IconGrid size={15} className={styles.sideNavIcon} /><span className={styles.sideNavText}>{tr(lang, 'showcase')}</span>
          </Link>
          <Link href="/connect" className={styles.sideNavLink} title={tr(lang, 'connect')}>
            <IconPlug size={15} className={styles.sideNavIcon} /><span className={styles.sideNavText}>{tr(lang, 'connect')}</span>
          </Link>
          <Link href="/sources" className={styles.sideNavLink} title={tr(lang, 'sources')}>
            <IconInbox size={15} className={styles.sideNavIcon} /><span className={styles.sideNavText}>{tr(lang, 'sources')}</span>
          </Link>
          <Link href="/sites" className={styles.sideNavLink} title={tr(lang, 'sites')}>
            <IconGlobe size={15} className={styles.sideNavIcon} /><span className={styles.sideNavText}>{tr(lang, 'sites')}</span>
          </Link>
          <Link href="/bin" className={styles.sideNavLink} title={tr(lang, 'trash')}>
            <IconTrash size={15} className={styles.sideNavIcon} /><span className={styles.sideNavText}>{tr(lang, 'trash')}</span>
          </Link>
        </nav>
        <div className={styles.sideFoot}>
          <span className={styles.live} aria-hidden="true" /> <span className={styles.sideFootText}>{loading ? 'Синхронізація…' : 'Синхронізовано · Online'}</span>
        </div>
      </aside>
      {sideOpen && <div className={styles.scrim} onClick={() => setSideOpen(false)} aria-hidden="true" />}

      {/* ── main column: top bar + grid ── */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setSideOpen((v) => !v)}
            aria-label={sideOpen ? 'Згорнути панель' : 'Розгорнути панель'}
            aria-expanded={sideOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className={styles.crumb}>
            <span className={styles.crumbDot} style={{ background: toneColor(tabs.find((t) => t.id === base)?.tone) }} aria-hidden="true" />
            <span className={styles.crumbName}>{tabs.find((t) => t.id === base)?.name ?? tr(lang, 'rootFolder')}</span>
            {!loading && <span className={styles.crumbCount}>{records.length}</span>}
          </span>
          <div className={styles.spacer} />
          {/* the action buttons. On desktop this wrapper is display:contents,
              so the layout is unchanged; in responsive it becomes a full-width
              second row, letting the language + theme sit on the first row next
              to the base name. */}
          <div className={styles.topActions}>
          {isCustom && (
            <BaseAiActions baseId={base} baseName={tabs.find((t) => t.id === base)?.name ?? tr(lang, 'rootFolder')} columns={displayColumns} />
          )}
          {isCustom && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={checkLinks}
              disabled={checkingLinks}
              aria-label="Перевірити джерела"
              title="Відкрити кожне джерело з рядків, позначити биті й перевірити, чи цитата дійсно є на сторінці. Це механічна перевірка джерела, а не достовірності рядка."
            >
              <IconGlobe size={16} />
            </button>
          )}
          {isCustom && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={dedupe}
              disabled={deduping}
              aria-label="Злити дублі"
              title="Знайти рядки з однаковою назвою і злити кожну групу в один: порожні клітинки заповнюються з дублів, зайві їдуть у кошик."
            >
              <IconMerge size={16} />
            </button>
          )}
          {isCustom && sharing && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={shareBase}
              aria-label="Публічне посилання"
              title="Скопіювати публічне посилання лише для перегляду (без входу)"
            >
              <IconShare size={16} />
            </button>
          )}
          {isCustom && (
            <a href={reportHref} className={styles.iconBtn} title={tr(lang, 'mdHint')} aria-label="Markdown">
              <IconFile size={16} />
            </a>
          )}
          {isCustom && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".md,.csv,.tsv,.txt,text/markdown,text/csv,text/tab-separated-values"
                hidden
                onChange={(e) => { importFile(e.target.files?.[0]); e.currentTarget.value = ''; }}
              />
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => importInputRef.current?.click()}
                aria-label="Імпорт"
                title="Імпортувати .md/.csv у цю базу (оновити рядки; стовпці за назвою, типи зберігаються)"
              >
                <IconUpload size={16} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={scrapeUrl}
                aria-label="Витягти з URL"
                title="Витягти дані зі сторінки в цю базу (ScrapeGraphAI): колонки бази — це схема витягування"
              >
                <IconScrape size={16} />
              </button>
            </>
          )}
          </div>
          {/* «+ New research» sits by the language button (in responsive it joins
              the language + theme on the first row, not the actions row below) */}
          <Link href="/research" className={styles.newResearch}>{tr(lang, 'newResearch')}</Link>
          {/* language on the right, next to the theme: segments on desktop,
              the compact cycle button on narrow screens */}
          <span className={styles.langRight}>
            <span className={styles.langSegments}><LangSwitch variant="segments" /></span>
            <span className={styles.langCycle}><LangSwitch variant="cycle" /></span>
          </span>
          <ThemeToggle />
        </header>

        {creating && (
          <CreateBase
            parents={tabs.map((t) => ({ id: t.id, name: t.name }))}
            initialParent={createParent}
            onCancel={() => { setCreating(false); setCreateParent(undefined); }}
            onCreated={async (id) => {
              setCreating(false);
              setCreateParent(undefined);
              await loadBases();
              onBaseChange(id);
            }}
          />
        )}

        <div className={styles.content}>
          {(() => {
            // clickable path to the current base; only shown when it's nested
            const path = basePath(tabs, base);
            if (path.length <= 1) return null;
            return (
              <nav className={styles.crumbs} aria-label="breadcrumbs">
                {path.map((node, i) => {
                  const last = i === path.length - 1;
                  return (
                    <span key={node.id} className={styles.crumbNode}>
                      {i > 0 && <span className={styles.crumbSep} aria-hidden="true">/</span>}
                      {last ? (
                        <span className={styles.crumbNow} aria-current="page">{node.name}</span>
                      ) : (
                        <button type="button" className={styles.crumbLink} onClick={() => onBaseChange(node.id)}>
                          {node.name}
                        </button>
                      )}
                    </span>
                  );
                })}
              </nav>
            );
          })()}
          {isCustom && (
            <div className={styles.modeRow}>
              <div className={styles.modeBar} role="tablist" aria-label={tr(lang, 'modeLabel')}>
                {/* the two mode labels ARE the stored constants (ТЗ vocabulary,
                    fixed Russian and not translatable), so the whole toggle stays
                    Russian — «Все» is hardcoded to match, not i18n'd, otherwise it
                    reads «Усі» in uk next to Russian modes */}
                {([
                  ['all', 'Все'],
                  [MODE_RESEARCH, MODE_RESEARCH],
                  [MODE_REFERENCE, MODE_REFERENCE],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    className={mode === value ? styles.modeSegOn : styles.modeSeg}
                    onClick={() => setMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {shownRecords.length > 0 && (
                <BaseSummary columns={displayColumns} records={shownRecords} total={total} />
              )}
            </div>
          )}
          <MindSheet
            columns={displayColumns}
            records={shownRecords}
            total={total}
            loading={loading}
            filtersPosition="menu"
            toolbarLead={
              <SavedViews
                base={base}
                sort={sort}
                extraLevels={extraLevels}
                filters={filters}
                search={search}
                onApply={(v) => {
                  setSort(v.sort);
                  setExtraLevels(v.extraLevels ?? []);
                  setFilters(v.filters ?? {});
                  setSearch(v.search ?? '');
                }}
              />
            }
            forceDisplay={{ wrap: 'shrink' }}
            sort={sort}
            filters={filters}
            filterOptions={displayFacets}
            search={search}
            sorts={sort ? [sort, ...extraLevels] : extraLevels}
            onSortChange={onSortChange}
            onSortsChange={onSortsChange}
            onSortReset={onSortReset}
            onSortsSet={(levels) => { setSort(levels[0]); setExtraLevels(levels.slice(1)); }}
            groupBy={groupBy}
            onGroupBySet={setGroupBy}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            favoritesOnly={favoritesOnly}
            onFavoritesOnlyChange={setFavoritesOnly}
            onFiltersChange={setFilters}
            onSearchChange={setSearch}
            onRowOpen={(record) => {
              // §5.5: a knowledge-base record opens as its own reading view
              // (the "статья"). A custom row — native or merged into the catalog
              // — carries the base it truly lives in via __baseId; catalog
              // products have no base and keep the /product/<slug> page.
              const r = record as Record<string, unknown>;
              const baseId = typeof r.__baseId === 'string' && r.__baseId ? r.__baseId : (isCustom ? base : undefined);
              if (baseId) router.push(`/topic/${baseId}/${r.id}`);
              else router.push(`/product/${r.id}`);
            }}
            editable={isCustom}
            onCellEdit={onCellEdit}
            onAddRow={onAddRow}
            onRowReorder={isCustom && !favoritesOnly ? reorderRows : undefined}
            onDeleteRow={isCustom ? onDeleteRow : undefined}
            editableColumns={isCustom}
            onColumnAdd={(col) => columnAction({ action: 'add', column: col })}
            onColumnRename={(key, label) => columnAction({ action: 'update', key, patch: { label } })}
            onColumnRetype={(key, type) => columnAction({ action: 'update', key, patch: { type } })}
            onColumnDelete={(key) => columnAction({ action: 'delete', key })}
            onColumnFormat={(key, format) => columnAction({ action: 'update', key, patch: { numberFormat: format } })}
            onColumnsReorder={(keys) => columnAction({ action: 'reorder', keys })}
            autoGroup
            recordCard
            cellSelection
            cellFormats={cellFormats}
            onCellFormat={isCustom ? onCellFormat : undefined}
            onBulkEdit={isCustom ? onBulkEdit : undefined}
            viewKey={base}
            strings={mindsheetStrings(lang)}
            accent={toneColor(tabs.find((t) => t.id === base)?.tone)}
          />
        </div>
      </div>
    </div>
  );
}
