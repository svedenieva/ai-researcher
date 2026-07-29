'use client';

import { useCallback, useEffect, useState } from 'react';
import { MindSheet } from '@mindsheet';
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
