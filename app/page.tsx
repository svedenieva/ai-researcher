'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MindSheet } from '@aivocado/mindsheet';
import type { CatalogRecord, ColumnDef, ListParams } from '@/lib/datasource/types';
import { CATALOG_COLUMNS } from '@/lib/datasource/columns';
import { BASES, DEFAULT_BASE } from '@/lib/datasource/bases';
import ThemeToggle from './theme-toggle';
import LangSwitch from './lang-switch';
import CreateBase from './create-base';
import BasePicker from './base-picker';
import { useLang } from './lang-provider';
import { t as tr, mindsheetStrings } from '@/lib/i18n';
import styles from './page.module.css';

const DEFAULT_SORT = { key: 'pop', dir: 'asc' as const };

const FILTER_KEYS = new Set(CATALOG_COLUMNS.filter((c) => c.filterable).map((c) => c.key));
const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

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
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [total, setTotal] = useState<number>();
  const [facets, setFacets] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<ListParams['sort']>(DEFAULT_SORT);
  // extra grouping levels (Shift + click), at most 2 beyond the first
  const [extraLevels, setExtraLevels] = useState<NonNullable<ListParams['sort']>[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [base, setBase] = useState<string>(DEFAULT_BASE);
  const [tabs, setTabs] = useState<BaseTab[]>(BUILTIN_TABS);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [creating, setCreating] = useState(false);
  // favorite sources of the current base
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

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
      fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, id: record.id, data: { [key]: coerce(key, value) } }),
      }).then(() => setRefreshTick((t) => t + 1));
    },
    [base, coerce],
  );

  const onAddRow = useCallback(
    (data: Record<string, string>) => {
      const payload: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(data)) if (v !== '') payload[k] = coerce(k, v);
      fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, data: payload }),
      }).then(() => setRefreshTick((t) => t + 1));
    },
    [base, coerce],
  );

  const onDeleteRow = useCallback(
    (record: CatalogRecord) => {
      // rows pulled in from nested child bases are tagged with __source =
      // the child base's display name — they can only be deleted there, otherwise
      // DELETE won't find the record in the current base and silently deletes nothing
      const currentName = tabs.find((t) => t.id === base)?.name;
      const source = record.__source;
      if (source && currentName && source !== currentName) {
        window.alert(`Эту строку удаляйте в её базе: «${source}»`);
        return;
      }
      if (!window.confirm('Удалить строку в корзину? Её можно вернуть из корзины.')) return;
      fetch('/api/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, ids: [String(record.id)] }),
      }).then(() => setRefreshTick((t) => t + 1));
    },
    [base, tabs],
  );

  const loadBases = useCallback(async () => {
    try {
      const r = await fetch('/api/bases');
      const body = await r.json();
      if (Array.isArray(body.bases) && body.bases.length) setTabs(body.bases);
    } catch {
      /* keep the built-in tabs */
    }
  }, []);

  // live column management — one route, different actions; after each one
  // we re-read the records (columns come back together with them)
  const columnAction = useCallback(
    (payload: Record<string, unknown>) => {
      fetch('/api/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, ...payload }),
      }).then(() => setRefreshTick((t) => t + 1));
    },
    [base],
  );

  // manual row order: we send the full list of ids in the new order, then
  // re-read (the server returns the rows already in the new order)
  const reorderRows = useCallback(
    (orderedIds: string[]) => {
      fetch('/api/records/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, order: orderedIds }),
      }).then(() => setRefreshTick((t) => t + 1));
    },
    [base],
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
    const f: Record<string, string> = {};
    for (const [key, value] of p.entries()) {
      if (FILTER_KEYS.has(key)) f[key] = value;
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
    const qs = new URLSearchParams();
    if (base !== DEFAULT_BASE) qs.set('base', base);
    if (sort) { qs.set('sortKey', sort.key); qs.set('sortDir', sort.dir); }
    for (const [key, value] of Object.entries(filters)) qs.append('f', `${key}:${value}`);
    if (search.trim()) { qs.set('q', search.trim()); }
    setLoading(true);
    fetch(`/api/records?${qs.toString()}`)
      .then((r) => r.json())
      .then((body) => {
        setColumns(body.columns ?? []);
        setRecords(body.records ?? []);
        setTotal(body.total ?? body.records?.length ?? 0);
        setFacets(body.facets ?? {});
      })
      .finally(() => setLoading(false));
  }, [sort, filters, search, base, ready, refreshTick]);

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
    fetch(`/api/favorites?base=${encodeURIComponent(base)}`)
      .then((r) => r.json())
      .then((b) => setFavorites(Array.isArray(b.favorites) ? b.favorites : []))
      .catch(() => setFavorites([]));
  }, [base, ready]);

  const onToggleFavorite = useCallback(
    (record: CatalogRecord) => {
      const id = String(record.id);
      // optimistic — the star responds immediately
      setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, record: id }),
      }).catch(() => {
        // it failed — roll back
        setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      });
    },
    [base],
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
  }, []);


  // "favorites only" filters the already-loaded records
  const shownRecords = favoritesOnly
    ? records.filter((r) => favorites.includes(String(r.id)))
    : records;

  // The export link mirrors the data request — what's on screen is what's in the file
  const exportHref = (() => {
    const qs = new URLSearchParams();
    if (base !== DEFAULT_BASE) qs.set('base', base);
    if (sort) { qs.set('sortKey', sort.key); qs.set('sortDir', sort.dir); }
    for (const [key, value] of Object.entries(filters)) qs.append('f', `${key}:${value}`);
    if (search.trim()) qs.set('q', search.trim());
    const s = qs.toString();
    return `/api/records/export${s ? `?${s}` : ''}`;
  })();


  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">AiR</span>
          <Link href="/" className={styles.brandName}>AI Researcher</Link>
        </div>

        <BasePicker
          tabs={tabs}
          base={base}
          onChange={onBaseChange}
          onCreate={() => setCreating(true)}
          onMutated={loadBases}
        />

        <div className={styles.headerActions}>
          {/* name of the selected base — on the right */}
          <span className={styles.currentBase}>
            {tabs.find((t) => t.id === base)?.name ?? ''}
            {!loading && <span className={styles.currentCount}>{records.length}</span>}
          </span>
          <a
            href={exportHref}
            className={styles.navLink}
            title={tr(lang, 'csvHint')}
          >
            ↓ CSV
          </a>
          <Link href="/sites" className={styles.navLink}>{tr(lang, 'sites')}</Link>
          <Link href="/bin" className={styles.navLink}>{tr(lang, 'trash')}</Link>
          <Link href="/research" className={styles.newResearch}>{tr(lang, 'newResearch')}</Link>
          <LangSwitch />
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        {creating && (
          <CreateBase
            parents={tabs.map((t) => ({ id: t.id, name: t.name }))}
            onCancel={() => setCreating(false)}
            onCreated={async (id) => {
              setCreating(false);
              await loadBases();
              onBaseChange(id);
            }}
          />
        )}

        <div className={styles.content}>
          <MindSheet
            columns={columns}
            records={shownRecords}
            total={total}
            loading={loading}
            filtersPosition="left"
            sort={sort}
            filters={filters}
            filterOptions={facets}
            search={search}
            sorts={sort ? [sort, ...extraLevels] : extraLevels}
            onSortChange={onSortChange}
            onSortsChange={onSortsChange}
            onSortReset={onSortReset}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            favoritesOnly={favoritesOnly}
            onFavoritesOnlyChange={setFavoritesOnly}
            onFiltersChange={setFilters}
            onSearchChange={setSearch}
            onRowOpen={isCustom ? undefined : (record) => router.push(`/product/${record.id}`)}
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
            onColumnsReorder={(keys) => columnAction({ action: 'reorder', keys })}
            autoGroup
            recordCard
            viewKey={base}
            strings={mindsheetStrings(lang)}
          />
        </div>
      </main>
    </div>
  );
}
