'use client';

import { useMemo, useState } from 'react';
import { parseTable, inferType } from '@/lib/parseTable';
import type { ColumnType } from '@/lib/datasource/types';
import styles from './forms.module.css';

interface ColDraft {
  label: string;
  type: ColumnType;
  filterable: boolean;
}

const TYPE_LABELS: Record<ColumnType, string> = {
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
  const [mode, setMode] = useState<'manual' | 'import'>('manual');
  const [name, setName] = useState('');
  const [cols, setCols] = useState<ColDraft[]>([{ label: 'Название', type: 'text', filterable: false }]);
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── manual columns ──
  const setCol = (i: number, patch: Partial<ColDraft>) =>
    setCols((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addCol = () => setCols((prev) => [...prev, { label: '', type: 'text', filterable: false }]);
  const removeCol = (i: number) => setCols((prev) => prev.filter((_, j) => j !== i));

  // ── import: parse pasted / uploaded table ──
  const parsed = useMemo(() => parseTable(raw), [raw]);
  const importCols: ColDraft[] = useMemo(
    () =>
      parsed.headers.map((h, i) => {
        const type = inferType(parsed.rows.map((r) => r[i] ?? ''));
        return { label: h || `Колонка ${i + 1}`, type, filterable: type === 'select' };
      }),
    [parsed],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setRaw(await file.text());
    if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async () => {
    const columns = mode === 'manual' ? cols.filter((c) => c.label.trim()) : importCols;
    if (!name.trim() || !columns.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          columns,
          rows: mode === 'import' ? parsed.rows : undefined,
        }),
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

  const manualKept = cols.filter((c) => c.label.trim());
  const canSubmit =
    !!name.trim() && (mode === 'manual' ? manualKept.length > 0 : importCols.length > 0);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Новая база</h2>
        <span className={styles.panelHint}>с нуля или импортом из таблицы</span>
      </div>

      <div className={styles.modeTabs}>
        <button
          type="button"
          className={mode === 'manual' ? styles.modeActive : styles.modeTab}
          onClick={() => setMode('manual')}
        >
          Вручную
        </button>
        <button
          type="button"
          className={mode === 'import' ? styles.modeActive : styles.modeTab}
          onClick={() => setMode('import')}
        >
          Импорт таблицы
        </button>
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

      {mode === 'manual' ? (
        <>
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
                  onChange={(e) => setCol(i, { type: e.target.value as ColumnType })}
                >
                  {(Object.keys(TYPE_LABELS) as ColumnType[]).map((t) => (
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
        </>
      ) : (
        <>
          <div className={styles.importRow}>
            <label className={styles.uploadBtn}>
              Загрузить CSV
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                hidden
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            <span className={styles.panelHint}>или вставь таблицу ниже (Ctrl+V из Google Sheets / Excel)</span>
          </div>
          <textarea
            className={styles.input}
            rows={5}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={'Название\tКатегория\tЦена\nFigma\tUI\t15\nFramer\tUI\t30'}
          />
          {parsed.headers.length > 0 && (
            <div className={styles.importPreview}>
              <div className={styles.previewLine}>
                <strong>{importCols.length}</strong> колонок · <strong>{parsed.rows.length}</strong> строк
              </div>
              <div className={styles.previewCols}>
                {importCols.map((c, i) => (
                  <span key={i} className={styles.previewChip}>
                    {c.label} <em>{TYPE_LABELS[c.type]}</em>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>Отмена</button>
        <button type="button" className={styles.primary} onClick={submit} disabled={busy || !canSubmit}>
          {busy
            ? 'Создаю…'
            : mode === 'import' && parsed.rows.length
              ? `Импортировать ${parsed.rows.length} строк`
              : 'Создать базу'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
