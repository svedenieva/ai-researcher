'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MindSheet } from '@aivocado/mindsheet';
import type { CatalogRecord, ColumnDef, ListParams } from '@/lib/datasource/types';
import { CATALOG_COLUMNS } from '@/lib/datasource/columns';
import { BASES, DEFAULT_BASE } from '@/lib/datasource/bases';
import ThemeToggle from './theme-toggle';
import CreateBase from './create-base';
import BasePicker from './base-picker';
import BaseTreeModal from './base-tree-modal';
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
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [total, setTotal] = useState<number>();
  const [facets, setFacets] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<ListParams['sort']>(DEFAULT_SORT);
  // дополнительные уровни группировки (Shift + клик), максимум 2 сверх первого
  const [extraLevels, setExtraLevels] = useState<NonNullable<ListParams['sort']>[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [base, setBase] = useState<string>(DEFAULT_BASE);
  const [tabs, setTabs] = useState<BaseTab[]>(BUILTIN_TABS);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);

  const isCustom = !BUILTIN_IDS.has(base);

  // числовые колонки приводим к числу перед сохранением
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

  const loadBases = useCallback(async () => {
    try {
      const r = await fetch('/api/bases');
      const body = await r.json();
      if (Array.isArray(body.bases) && body.bases.length) setTabs(body.bases);
    } catch {
      /* оставляем встроенные табы */
    }
  }, []);

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

  // Клик по заголовку — обычная сортировка (первый уровень группировки).
  // Shift + клик — добавить/переключить дополнительный уровень (всего до 3).
  const onSortsChange = useCallback(
    (key: string, additive: boolean) => {
      if (!additive) {
        onSortChange(key);
        return;
      }
      setExtraLevels((prev) => {
        if (sort?.key === key) return prev; // это уже первый уровень
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

  const onBaseChange = useCallback((id: string) => {
    setBase(id);
    setFilters({});
    setSearch('');
    setCreating(false);
  }, []);


  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">AiR</span>
        </div>

        <BasePicker tabs={tabs} base={base} onChange={onBaseChange} onOpenTree={() => setTreeOpen(true)} />

        <div className={styles.headerActions}>
          <Link href="/research" className={styles.newResearch}>+ Новое исследование</Link>
          <ThemeToggle />
        </div>
      </header>

      {treeOpen && (
        <BaseTreeModal
          tabs={tabs}
          base={base}
          onPick={(id) => {
            onBaseChange(id);
            setTreeOpen(false);
          }}
          onClose={() => setTreeOpen(false)}
          onCreate={() => setCreating(true)}
        />
      )}

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
            records={records}
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
            onFiltersChange={setFilters}
            onSearchChange={setSearch}
            onRowOpen={isCustom ? undefined : (record) => router.push(`/product/${record.id}`)}
            editable={isCustom}
            onCellEdit={onCellEdit}
            onAddRow={onAddRow}
            autoGroup
          />
        </div>
      </main>
    </div>
  );
}
