'use client';

import { useEffect, useRef, useState } from 'react';
import type { ColumnDef } from '@/lib/datasource/types';
import { t as tr, type Lang } from '@/lib/i18n';
import {
  type FilterModel,
  type FilterOp,
  type Condition,
  type CondGroup,
  NO_VALUE_OPS,
  isGroup,
  countConditions,
  emptyFilterModel,
} from '@/lib/filter-conditions';
import styles from './filter-conditions.module.css';

// операторы, доступные для типа колонки
function opsFor(type: ColumnDef['type']): FilterOp[] {
  if (type === 'number' || type === 'rating' || type === 'date')
    return ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'empty', 'nempty'];
  if (type === 'multiselect') return ['contains', 'ncontains', 'eq', 'ne', 'empty', 'nempty'];
  return ['contains', 'ncontains', 'eq', 'ne', 'empty', 'nempty'];
}
const OP_KEY: Record<FilterOp, string> = {
  contains: 'opContains', ncontains: 'opNContains', eq: 'opEq', ne: 'opNe',
  gt: 'opGt', lt: 'opLt', gte: 'opGte', lte: 'opLte', empty: 'opEmpty', nempty: 'opNEmpty',
};

interface Props {
  columns: ColumnDef[];
  model: FilterModel;
  onChange: (m: FilterModel) => void;
  lang: Lang;
}

export default function FilterConditions({ columns, model, onChange, lang }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cols = columns.filter((c) => c.type !== 'long-text');
  const count = countConditions(model);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const defCond = (): Condition => ({ key: cols[0]?.key ?? '', op: 'contains', value: '' });
  const setItem = (i: number, next: FilterModel['items'][number]) =>
    onChange({ ...model, items: model.items.map((it, j) => (j === i ? next : it)) });
  const removeItem = (i: number) => onChange({ ...model, items: model.items.filter((_, j) => j !== i) });
  const addCond = () => onChange({ ...model, items: [...model.items, defCond()] });
  const addGroup = () => onChange({ ...model, items: [...model.items, { match: 'all', conds: [defCond()] } as CondGroup] });

  const condRow = (c: Condition, onSet: (c: Condition) => void, onDel: () => void, key: string) => {
    const col = cols.find((x) => x.key === c.key);
    const ops = opsFor(col?.type ?? 'text');
    const op = ops.includes(c.op) ? c.op : ops[0];
    return (
      <div className={styles.row} key={key}>
        <select className={styles.sel} value={c.key} onChange={(e) => onSet({ ...c, key: e.target.value })}>
          {cols.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <select className={styles.sel} value={op} onChange={(e) => onSet({ ...c, op: e.target.value as FilterOp })}>
          {ops.map((o) => <option key={o} value={o}>{tr(lang, OP_KEY[o] as Parameters<typeof tr>[1])}</option>)}
        </select>
        {!NO_VALUE_OPS.includes(op) && (
          <input
            className={styles.val}
            value={c.value ?? ''}
            placeholder={tr(lang, 'fcValue')}
            onChange={(e) => onSet({ ...c, value: e.target.value })}
          />
        )}
        <button type="button" className={styles.del} onClick={onDel} aria-label="×">×</button>
      </div>
    );
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger + (count ? ' ' + styles.on : '')}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {tr(lang, 'fcButton')}{count ? ` · ${count}` : ''}
      </button>
      {open && (
        <div className={styles.panel} role="dialog">
          <div className={styles.head}>
            <span className={styles.title}>{tr(lang, 'fcTitle')}</span>
            <select
              className={styles.match}
              value={model.match}
              onChange={(e) => onChange({ ...model, match: e.target.value as 'all' | 'any' })}
            >
              <option value="all">{tr(lang, 'fcAll')}</option>
              <option value="any">{tr(lang, 'fcAny')}</option>
            </select>
          </div>

          {model.items.map((it, i) =>
            isGroup(it) ? (
              <div className={styles.group} key={`g${i}`}>
                <div className={styles.groupHead}>
                  <select
                    className={styles.matchSm}
                    value={it.match}
                    onChange={(e) => setItem(i, { ...it, match: e.target.value as 'all' | 'any' })}
                  >
                    <option value="all">{tr(lang, 'fcAll')}</option>
                    <option value="any">{tr(lang, 'fcAny')}</option>
                  </select>
                  <button type="button" className={styles.del} onClick={() => removeItem(i)} aria-label="×">×</button>
                </div>
                {it.conds.map((c, j) =>
                  condRow(
                    c,
                    (nc) => setItem(i, { ...it, conds: it.conds.map((x, k) => (k === j ? nc : x)) }),
                    () => setItem(i, { ...it, conds: it.conds.filter((_, k) => k !== j) }),
                    `g${i}c${j}`,
                  ),
                )}
                <button type="button" className={styles.addSm} onClick={() => setItem(i, { ...it, conds: [...it.conds, defCond()] })}>
                  {tr(lang, 'fcAddCond')}
                </button>
              </div>
            ) : (
              condRow(it as Condition, (nc) => setItem(i, nc), () => removeItem(i), `c${i}`)
            ),
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.add} onClick={addCond}>{tr(lang, 'fcAddCond')}</button>
            <button type="button" className={styles.add} onClick={addGroup}>{tr(lang, 'fcAddGroup')}</button>
            {count > 0 && (
              <button type="button" className={styles.clear} onClick={() => onChange(emptyFilterModel())}>
                {tr(lang, 'fcClear')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
