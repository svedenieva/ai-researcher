'use client';

import { useCallback, useEffect, useState } from 'react';
import { MindSheet } from '@mindsheet';
import type { CatalogRecord, ColumnDef, ListParams } from '@/lib/datasource/types';
import styles from './page.module.css';

export default function Home() {
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [facets, setFacets] = useState<Record<string, string[]>>({});
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
      .then((body) => { setColumns(body.columns); setRecords(body.records); setFacets(body.facets ?? {}); })
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
    <main className={styles.page}>
      <h1 className={styles.title}>База знаний · Продукты и конкуренты</h1>
      <p className={styles.lede}>
        {loading
          ? 'Загрузка…'
          : 'Исследования конкурентов и продуктов. Сортируйте по любой колонке, фильтруйте по региону, вертикали и грейду.'}
      </p>
      <MindSheet
        columns={columns}
        records={records}
        sort={sort}
        filter={filter}
        filterOptions={facets}
        onSortChange={onSortChange}
        onFilterChange={setFilter}
      />
    </main>
  );
}
