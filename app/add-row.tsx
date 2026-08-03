'use client';

import { useState } from 'react';
import type { ColumnDef } from '@/lib/datasource/types';
import styles from './forms.module.css';

export default function AddRow({
  columns,
  baseId,
  onCancel,
  onAdded,
}: {
  columns: ColumnDef[];
  baseId: string;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    // приводим числовые колонки к числам, пустые — опускаем
    const data: Record<string, unknown> = {};
    for (const col of columns) {
      const raw = values[col.key];
      if (raw === undefined || raw === '') continue;
      data[col.key] = col.type === 'number' ? Number(raw) : raw;
    }
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base: baseId, data }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Ошибка добавления');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Новая строка</h2>
      </div>

      <div className={styles.rowFields}>
        {columns.map((col) => (
          <label key={col.key} className={styles.field}>
            <span className={styles.fieldLabel}>{col.label}</span>
            {col.type === 'long-text' ? (
              <textarea
                className={styles.input}
                rows={2}
                value={values[col.key] ?? ''}
                onChange={(e) => set(col.key, e.target.value)}
              />
            ) : (
              <input
                className={styles.input}
                type={col.type === 'number' ? 'number' : 'text'}
                value={values[col.key] ?? ''}
                onChange={(e) => set(col.key, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>Отмена</button>
        <button type="button" className={styles.primary} onClick={submit} disabled={busy}>
          {busy ? 'Добавляю…' : 'Добавить'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
