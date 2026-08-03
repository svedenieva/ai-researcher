'use client';

import { useState } from 'react';
import styles from './forms.module.css';

interface ColDraft {
  label: string;
  type: 'text' | 'number' | 'select' | 'long-text' | 'url';
  filterable: boolean;
}

const TYPE_LABELS: Record<ColDraft['type'], string> = {
  text: 'Текст',
  number: 'Число',
  select: 'Выбор',
  'long-text': 'Длинный текст',
  url: 'Ссылка',
};

export default function CreateBase({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [cols, setCols] = useState<ColDraft[]>([
    { label: 'Название', type: 'text', filterable: false },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCol = (i: number, patch: Partial<ColDraft>) =>
    setCols((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addCol = () => setCols((prev) => [...prev, { label: '', type: 'text', filterable: false }]);
  const removeCol = (i: number) => setCols((prev) => prev.filter((_, j) => j !== i));

  const kept = cols.filter((c) => c.label.trim());

  const submit = async () => {
    if (!name.trim() || !kept.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), columns: kept }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Ошибка создания');
      onCreated(body.base.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Новая база</h2>
        <span className={styles.panelHint}>задай название и колонки — база появится в переключателе</span>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Название базы</span>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Напр.: Инструменты для дизайна"
          autoFocus
        />
      </label>

      <div className={styles.colsLabel}>Колонки</div>
      <div className={styles.colList}>
        {cols.map((c, i) => (
          <div key={i} className={styles.colRow}>
            <input
              className={styles.input}
              value={c.label}
              onChange={(e) => setCol(i, { label: e.target.value })}
              placeholder="Название колонки"
            />
            <select
              className={styles.select}
              value={c.type}
              onChange={(e) => setCol(i, { type: e.target.value as ColDraft['type'] })}
            >
              {(Object.keys(TYPE_LABELS) as ColDraft['type'][]).map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
            <label className={styles.checkbox} title="Показывать фильтр по этой колонке">
              <input
                type="checkbox"
                checked={c.filterable}
                onChange={(e) => setCol(i, { filterable: e.target.checked })}
                disabled={c.type === 'long-text' || c.type === 'url'}
              />
              фильтр
            </label>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => removeCol(i)}
              disabled={cols.length === 1}
              aria-label="Убрать колонку"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={styles.ghost} onClick={addCol}>+ Колонка</button>

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>Отмена</button>
        <button
          type="button"
          className={styles.primary}
          onClick={submit}
          disabled={busy || !name.trim() || !kept.length}
        >
          {busy ? 'Создаю…' : 'Создать базу'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
