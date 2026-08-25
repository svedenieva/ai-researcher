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
import BaseTree from './base-tree';
import { useLang } from './lang-provider';
import { t as tr, mindsheetStrings } from '@/lib/i18n';
import { toneColor } from '@/lib/tone';
import { recordsQuery } from '@/lib/records-query';
import { apiJson, apiSend } from '@/lib/api';
import { useToast, useConfirm } from './ui';
import { IconDownload } from './icons';

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
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);

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
      apiSend('/api/records', 'PATCH', { base, id: record.id, data: { [key]: coerce(key, value) } })
        .then(() => setRefreshTick((t) => t + 1))
        .catch((e) => toast(e instanceof Error ? e.message : 'Не удалось сохранить'));
    },
    [base, coerce, toast],
  );

  const onAddRow = useCallback(
    (data: Record<string, string>) => {
      const payload: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(data)) if (v !== '') payload[k] = coerce(k, v);
      apiSend('/api/records', 'POST', { base, data: payload })
        .then(() => setRefreshTick((t) => t + 1))
        .catch((e) => toast(e instanceof Error ? e.message : 'Не удалось добавить строку'));
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
        toast(`Эту строку удаляйте в её базе: «${source}»`);
        return;
      }
      const ok = await confirm({
        title: 'Удалить строку?',
        message: 'Строка уедет в корзину — вернуть можно оттуда.',
        confirmLabel: 'Удалить',
        danger: true,
      });
      if (!ok) return;
      try {
        await apiSend('/api/records', 'DELETE', { base, ids: [String(record.id)] });
        setRefreshTick((t) => t + 1);
        toast('Строка удалена');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Не удалось удалить строку');
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
      const r = await apiSend<{ rows: number; urls: number; dead: number; skipped: number }>(
        '/api/records/check-links',
        'POST',
        { base },
      );
      setRefreshTick((t) => t + 1);
      const tail = r.skipped ? `, не проверено: ${r.skipped}` : '';
      toast(
        r.urls === 0
          ? 'Ссылок в строках не нашлось'
          : r.dead
            ? `Проверено ссылок: ${r.urls}, битых: ${r.dead}${tail}`
            : `Проверено ссылок: ${r.urls} — все открылись${tail}`,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось проверить ссылки');
    } finally {
      setCheckingLinks(false);
    }
  }, [base, toast]);

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
        .catch((e) => toast(e instanceof Error ? e.message : 'Не удалось изменить колонку'));
    },
    [base, toast],
  );

  // manual row order: we send the full list of ids in the new order, then
  // re-read (the server returns the rows already in the new order)
  const reorderRows = useCallback(
    (orderedIds: string[]) => {
      apiSend('/api/records/reorder', 'POST', { base, order: orderedIds })
        .then(() => setRefreshTick((t) => t + 1))
        .catch((e) => toast(e instanceof Error ? e.message : 'Не удалось изменить порядок'));
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
    const qs = recordsQuery({ base, sort, filters, search, mode: 'all' });
    setLoading(true);
    apiJson<{ columns?: ColumnDef[]; records?: CatalogRecord[]; total?: number; facets?: Record<string, string[]>; warning?: string }>(`/api/records?${qs}`)
      .then((body) => {
        setColumns(body.columns ?? []);
        setRecords(body.records ?? []);
        setTotal(body.total ?? body.records?.length ?? 0);
        setFacets(body.facets ?? {});
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
        toast(e instanceof Error ? e.message : 'Не удалось загрузить данные');
      })
      .finally(() => setLoading(false));
  }, [sort, filters, search, base, ready, refreshTick, toast]);

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
        toast(e instanceof Error ? e.message : 'Не удалось загрузить избранное');
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
        toast(e instanceof Error ? e.message : 'Не удалось сохранить избранное');
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
  }, []);


  // "favorites only" filters the already-loaded records
  const shownRecords = favoritesOnly
    ? records.filter((r) => favorites.includes(String(r.id)))
    : records;

  const displayColumns = columns;
  const displayFacets = facets;

  // The export link mirrors the data request — same builder, so the file can't
  // describe a different slice than the screen
  const exportQs = recordsQuery({ base, sort, filters, search, mode: 'all' });
  const exportHref = `/api/records/export${exportQs ? `?${exportQs}` : ''}`;


  return (
    <div className={`${styles.app} ${sideOpen ? '' : styles.sideClosed}`}>
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
        </div>
        <BaseTree
          embedded
          tabs={tabs}
          base={base}
          onPick={onBaseChange}
          onClose={() => {}}
          onCreate={() => setCreating(true)}
          onMutated={loadBases}
        />
        <div className={styles.sideFoot}>
          <span className={styles.live} aria-hidden="true" /> {loading ? 'Синхронізація…' : 'Синхронізовано · Online'}
        </div>
      </aside>

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
            {tabs.find((t) => t.id === base)?.name ?? tr(lang, 'rootFolder')}
            {!loading && <span className={styles.crumbCount}>{records.length}</span>}
          </span>
          <div className={styles.spacer} />
          {isCustom && (
            <button
              type="button"
              className={styles.navLink}
              onClick={checkLinks}
              disabled={checkingLinks}
              title="Открыть каждый источник из строк и пометить битые. Это проверка существования ссылки, а не достоверности строки."
            >
              {checkingLinks ? 'Проверяю…' : 'Проверить источники'}
            </button>
          )}
          <a href={exportHref} className={styles.navLink} title={tr(lang, 'csvHint')}>
            <IconDownload size={14} /> CSV
          </a>
          <nav className={styles.topNav} aria-label="Разделы">
            <Link href="/bases" className={styles.navLink}>{tr(lang, 'showcase')}</Link>
            <Link href="/connect" className={styles.navLink}>{tr(lang, 'connect')}</Link>
            <Link href="/sources" className={styles.navLink}>{tr(lang, 'sources')}</Link>
            <Link href="/sites" className={styles.navLink}>{tr(lang, 'sites')}</Link>
            <Link href="/bin" className={styles.navLink}>{tr(lang, 'trash')}</Link>
          </nav>
          <Link href="/research" className={styles.newResearch}>{tr(lang, 'newResearch')}</Link>
          <LangSwitch />
          <ThemeToggle />
        </header>

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
            columns={displayColumns}
            records={shownRecords}
            total={total}
            loading={loading}
            filtersPosition="top"
            sort={sort}
            filters={filters}
            filterOptions={displayFacets}
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
            accent={toneColor(tabs.find((t) => t.id === base)?.tone)}
          />
        </div>
      </div>
    </div>
  );
}
