'use client';

import { useCallback, useEffect, useState } from 'react';
import { MindSheet } from '@mindsheet';
import type { CatalogRecord, ColumnDef, ListParams } from '@/lib/datasource/types';
import ThemeToggle from './theme-toggle';
import Stats from './stats';
import styles from './page.module.css';

export default function Home() {
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [facets, setFacets] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<ListParams['sort']>();
  const [filter, setFilter] = useState<ListParams['filter']>();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (sort) { qs.set('sortKey', sort.key); qs.set('sortDir', sort.dir); }
    if (filter) { qs.set('filterKey', filter.key); qs.set('filterValue', filter.value); }
    if (search.trim()) { qs.set('q', search.trim()); }
    setLoading(true);
    fetch(`/api/records?${qs.toString()}`)
      .then((r) => r.json())
      .then((body) => { setColumns(body.columns); setRecords(body.records); setFacets(body.facets ?? {}); })
      .finally(() => setLoading(false));
  }, [sort, filter, search]);

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
            sort={sort}
            filter={filter}
            filterOptions={facets}
            search={search}
            onSortChange={onSortChange}
            onFilterChange={setFilter}
            onSearchChange={setSearch}
          />
        </div>
      </main>
    </div>
  );
}
