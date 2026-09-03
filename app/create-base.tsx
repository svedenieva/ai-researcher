'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseTable, inferType } from '@/lib/parseTable';
import type { ColumnType, ColumnDef } from '@/lib/datasource/types';
import { BASE_PRESETS, type BasePreset } from '@/lib/presets';
import { useLang } from './lang-provider';
import { t, tImportN, tColumnN } from '@/lib/i18n';
import { apiSend, apiJson } from '@/lib/api';
import { useToast } from './ui';
import styles from './forms.module.css';

interface ColDraft {
  label: string;
  type: ColumnType;
  filterable: boolean;
  // preset columns carry display metadata (stage order, colours, default group);
  // the manual editor ignores these but they ride along to the create request
  order?: string[];
  badge?: boolean;
  badgeVariant?: Record<string, string>;
  defaultGroup?: boolean;
}

export default function CreateBase({
  onCancel,
  onCreated,
  parents = [],
  initialParent,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
  parents?: { id: string; name: string }[];
  /** preselect the parent base (e.g. opened from a node's «+» in the tree) */
  initialParent?: string;
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
  const [parent, setParent] = useState(initialParent ?? '');
  const [cols, setCols] = useState<ColDraft[]>(() => [{ label: t(lang, 'defaultColName'), type: 'text', filterable: false }]);
  const [raw, setRaw] = useState('');
  const [shared, setShared] = useState(false); // ТР-БД-03: видимость общая/личная
  const [busy, setBusy] = useState(false);
  // rows a template ships pre-filled (positional to its columns). Dropped the
  // moment the user edits the columns, so seeded rows never end up misaligned.
  const [presetRows, setPresetRows] = useState<Array<Array<string | number>> | null>(null);
  // once the user touches the columns (or a preset does), stop auto-inheriting
  // the parent's schema on top of their work
  const colsTouched = useRef(false);

  // ── manual columns ──
  const setCol = (i: number, patch: Partial<ColDraft>) => {
    colsTouched.current = true;
    setPresetRows(null);
    setCols((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };
  const addCol = () => { colsTouched.current = true; setPresetRows(null); setCols((prev) => [...prev, { label: '', type: 'text', filterable: false }]); };
  const removeCol = (i: number) => { colsTouched.current = true; setPresetRows(null); setCols((prev) => prev.filter((_, j) => j !== i)); };

  // «наследуемое дерево»: a new sub-base inherits its parent's columns as the
  // starting schema (the user can still edit/add). Only while the columns are
  // pristine — a preset or a manual edit opts out.
  useEffect(() => {
    if (!parent || colsTouched.current) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<{ columns?: ColumnDef[] }>(`/api/records?base=${encodeURIComponent(parent)}`);
        if (cancelled || colsTouched.current) return;
        const inherited = (data.columns ?? [])
          .filter((c) => !c.key.startsWith('__'))
          .map((c) => ({
            label: c.label, type: c.type, filterable: !!c.filterable,
            order: c.order, badge: c.badge, badgeVariant: c.badgeVariant, defaultGroup: c.defaultGroup,
          }));
        if (inherited.length) setCols(inherited);
      } catch { /* parent columns are a convenience; ignore failures */ }
    })();
    return () => { cancelled = true; };
  }, [parent]);

  // a template fills the column schema (and the name, if empty) in one click,
  // then drops into the manual editor so the columns can still be tweaked
  const applyPreset = (p: BasePreset) => {
    colsTouched.current = true;
    if (!name.trim()) setName(p.name);
    setCols(
      p.columns.map((c) => ({
        label: c.label,
        type: c.type,
        filterable: !!c.filterable,
        order: c.order,
        badge: c.badge,
        badgeVariant: c.badgeVariant,
        defaultGroup: c.defaultGroup,
      })),
    );
    setPresetRows(p.rows ?? null);
    setMode('manual');
  };

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
        shared,
        rows: mode === 'import' ? parsed.rows : (presetRows ?? undefined),
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

      {BASE_PRESETS.length > 0 && (
        <div className={styles.presets}>
          <span className={styles.presetsLabel}>{t(lang, 'presetLabel')}</span>
          {BASE_PRESETS.map((p) => (
            <button
              type="button"
              key={p.id}
              className={styles.presetBtn}
              onClick={() => applyPreset(p)}
              title={p.blurb}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

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

      <label className={styles.field}>
        <span className={styles.checkboxRow}>
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t(lang, 'cbShared')}
        </span>
        <span className={styles.fieldHint}>{t(lang, 'cbSharedHint')}</span>
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
                accept=".csv,.tsv,.txt,.md,text/csv,text/tab-separated-values,text/markdown"
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
