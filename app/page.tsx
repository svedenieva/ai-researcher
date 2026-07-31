'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MindSheet } from '@aivocado/mindsheet';
import type { CatalogRecord, ColumnDef, ListParams } from '@/lib/datasource/types';
import ThemeToggle from './theme-toggle';
import Stats from './stats';
import styles from './page.module.css';

// default view: most popular first (user can re-sort by any column)
const DEFAULT_SORT = { key: 'pop', dir: 'asc' as const };

export default function Home() {
  const router = useRouter();
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [total, setTotal] = useState<number>();
  const [facets, setFacets] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<ListParams['sort']>(DEFAULT_SORT);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // hydrate state from the URL once, so shared links open with the same
  // filter/search/sort. Reading in an effect (not during render) keeps SSR
  // and client markup identical — no hydration mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    if (q) setSearch(q);
    const s = p.get('sort');
    if (s) {
      const [key, dir] = s.split(':');
      if (key) setSort({ key, dir: dir === 'desc' ? 'desc' : 'asc' });
    }
    const f: Record<string, string> = {};
    for (const [key, value] of p.entries()) {
      if (key !== 'q' && key !== 'sort') f[key] = value;
    }
    if (Object.keys(f).length) setFilters(f);
    setReady(true);
  }, []);

  // reflect the current state back into the URL (shareable, no history spam)
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (search.trim()) p.set('q', search.trim());
    for (const [key, value] of Object.entries(filters)) p.set(key, value);
    if (sort && !(sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir)) {
      p.set('sort', `${sort.key}:${sort.dir}`);
    }
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [filters, search, sort, ready]);

  useEffect(() => {
    if (!ready) return;
    const qs = new URLSearchParams();
    if (sort) { qs.set('sortKey', sort.key); qs.set('sortDir', sort.dir); }
    for (const [key, value] of Object.entries(filters)) qs.append('f', `${key}:${value}`);
    if (search.trim()) { qs.set('q', search.trim()); }
    setLoading(true);
    fetch(`/api/records?${qs.toString()}`)
      .then((r) => r.json())
      .then((body) => {
        setColumns(body.columns);
        setRecords(body.records);
        setTotal(body.total ?? body.records.length);
        setFacets(body.facets ?? {});
      })
      .finally(() => setLoading(false));
  }, [sort, filters, search, ready]);

  const onSortChange = useCallback((key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandName}>AI-Researcher</span>
          <span className={styles.brandKicker}>база знаний</span>
        </div>

        <div className={styles.headerActions}>
          <Link href="/research" className={styles.newResearch}>+ Новое исследование</Link>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <div className={styles.pageHeadRow}>
          <div className={styles.pageHead}>
            <h1 className={styles.title}>База знаний · Продукты и конкуренты</h1>
            <span className={styles.count}>{loading ? '…' : records.length}</span>
          </div>

          {records.length > 0 && <Stats records={records} />}
        </div>

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
            onSortChange={onSortChange}
            onFiltersChange={setFilters}
            onSearchChange={setSearch}
            onRowOpen={(record) => router.push(`/product/${record.id}`)}
          />
        </div>
      </main>
    </div>
  );
}
