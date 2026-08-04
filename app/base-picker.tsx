'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import BaseTree from './base-tree';
import styles from './base-picker.module.css';

export interface BaseTab {
  id: string;
  name: string;
  tone: string;
  builtin: boolean;
  parent: string | null;
}

export default function BasePicker({
  tabs,
  base,
  onChange,
  onCreate,
  rootLabel = 'AI-Researcher',
}: {
  tabs: BaseTab[];
  base: string;
  onChange: (id: string) => void;
  onCreate: () => void;
  rootLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);

  // путь от верхнего уровня до выбранной базы
  const path = useMemo(() => {
    const out: BaseTab[] = [];
    let cur = byId.get(base);
    while (cur) {
      out.unshift(cur);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return out;
  }, [base, byId]);

  // клик вне панели и Esc закрывают дерево
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav className={styles.crumbs} aria-label="Путь к базе" ref={ref}>
      {/* единственная точка входа в дерево баз */}
      <button
        type="button"
        className={`${styles.root} ${open ? styles.rootOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Выбрать базу данных"
      >
        <span className={styles.rootIcon} aria-hidden="true">🗂</span>
        {rootLabel}
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>

      {path.map((node, i) => (
        <span key={node.id} className={styles.crumbItem}>
          <span className={styles.sep} aria-hidden="true">›</span>
          {/* крошка — просто переход в этот раздел, без выпадающего списка */}
          <button
            type="button"
            className={`${styles.crumb} ${i === path.length - 1 ? styles.crumbCurrent : ''}`}
            onClick={() => onChange(node.id)}
            title={`Перейти: ${node.name}`}
          >
            {node.name}
          </button>
        </span>
      ))}

      {open && (
        <BaseTree
          tabs={tabs}
          base={base}
          // окно остаётся открытым — по дереву можно ходить сколько нужно
          onPick={onChange}
          onClose={() => setOpen(false)}
          onCreate={onCreate}
        />
      )}
    </nav>
  );
}
