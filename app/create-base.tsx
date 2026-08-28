'use client';

import { useMemo, useState } from 'react';
import { parseTable, inferType } from '@/lib/parseTable';
import type { ColumnType } from '@/lib/datasource/types';
import { useLang } from './lang-provider';
import { t, tImportN, tColumnN } from '@/lib/i18n';
import { apiSend } from '@/lib/api';
import { useToast } from './ui';
import styles from './forms.module.css';

interface ColDraft {
  label: string;
  type: ColumnType;
  filterable: boolean;
}

export default function CreateBase({
  onCancel,
  onCreated,
  parents = [],
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
  parents?: { id: string; name: string }[];
}) {
  const { lang } = useLang();
  const toast = useToast();
  const TYPE_LABELS: Record<ColumnType, string> = {
    text: t(lang, 'typeText'),
    number: t(lang, 'typeNumber'),
    select: t(lang, 'typeSelect'),
    multiselect: t(lang, 'typeMultiselect'),
    'long-text': t(lang, 'typeLongText'),
    url: t(lang, 'typeUrl'),
    date: t(lang, 'typeDate'),
    checkbox: t(lang, 'typeCheckbox'),
    rating: t(lang, 'typeRating'),
  };
  const [mode, setMode] = useState<'manual' | 'import'>('manual');
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [cols, setCols] = useState<ColDraft[]>(() => [{ label: t(lang, 'defaultColName'), type: 'text', filterable: false }]);
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);

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
        return { label: h || tColumnN(lang, i + 1), type, filterable: type === 'select' };
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
    try {
      const body = await apiSend<{ base: { id: string } }>('/api/bases', 'POST', {
        name: name.trim(),
        columns,
        parent: parent || undefined,
        rows: mode === 'import' ? parsed.rows : undefined,
      });
      onCreated(body.base.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : t(lang, 'error'));
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
        <h2 className={styles.panelTitle}>{t(lang, 'newBase')}</h2>
        <span className={styles.panelHint}>{t(lang, 'fromScratch')}</span>
      </div>

      <div className={styles.modeTabs}>
        <button
          type="button"
          className={mode === 'manual' ? styles.modeActive : styles.modeTab}
          onClick={() => setMode('manual')}
        >
          {t(lang, 'manualTab')}
        </button>
        <button
          type="button"
          className={mode === 'import' ? styles.modeActive : styles.modeTab}
          onClick={() => setMode('import')}
        >
          {t(lang, 'importTab')}
        </button>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t(lang, 'baseName')}</span>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(lang, 'baseNamePlaceholder')}
          autoFocus
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t(lang, 'insideBase')}</span>
        <select className={styles.input} value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">{t(lang, 'topLevel')}</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      {mode === 'manual' ? (
        <>
          <div className={styles.colsLabel}>{t(lang, 'columns')}</div>
          <div className={styles.colList}>
            {cols.map((c, i) => (
              <div key={i} className={styles.colRow}>
                <input
                  className={styles.input}
                  value={c.label}
                  onChange={(e) => setCol(i, { label: e.target.value })}
                  placeholder={t(lang, 'columnNamePlaceholder')}
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
                <label className={styles.checkbox} title={t(lang, 'showFilterTitle')}>
                  <input
                    type="checkbox"
                    checked={c.filterable}
                    onChange={(e) => setCol(i, { filterable: e.target.checked })}
                    disabled={c.type === 'long-text' || c.type === 'url'}
                  />
                  {t(lang, 'filterCheckbox')}
                </label>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => removeCol(i)}
                  disabled={cols.length === 1}
                  aria-label={t(lang, 'removeColumn')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={styles.ghost} onClick={addCol}>{t(lang, 'addColumnBtn')}</button>
        </>
      ) : (
        <>
          <div className={styles.importRow}>
            <label className={styles.uploadBtn}>
              {t(lang, 'uploadCsv')}
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                hidden
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            <span className={styles.panelHint}>{t(lang, 'orPaste')}</span>
          </div>
          <textarea
            className={styles.input}
            rows={5}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={t(lang, 'pasteExample')}
          />
          {parsed.headers.length > 0 && (
            <div className={styles.importPreview}>
              <div className={styles.previewLine}>
                <strong>{importCols.length}</strong> {t(lang, 'columnsWord')} · <strong>{parsed.rows.length}</strong> {t(lang, 'rowsWord')}
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
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>{t(lang, 'cancel')}</button>
        <button type="button" className={styles.primary} onClick={submit} disabled={busy || !canSubmit}>
          {busy
            ? t(lang, 'creating')
            : mode === 'import' && parsed.rows.length
              ? tImportN(lang, parsed.rows.length)
              : t(lang, 'create')}
        </button>
      </div>
    </section>
  );
}
