'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import BaseTree from './base-tree';
import { useLang } from './lang-provider';
import { t, tGoTo, tShowInside } from '@/lib/i18n';
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
  onMutated,
  rootLabel = 'AI-Researcher',
}: {
  tabs: BaseTab[];
  base: string;
  onChange: (id: string) => void;
  onCreate: () => void;
  /** база переименована/удалена — надо перечитать список баз */
  onMutated?: () => void;
  rootLabel?: string;
}) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  // узел, на котором раскрыть дерево: из корневой кнопки — текущая база,
  // из крошки — сам раздел. Дерево должно выпадать из направления, а не
  // только из общего корня.
  const [focus, setFocus] = useState<string | undefined>(undefined);
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
    <nav className={styles.crumbs} aria-label={t(lang, 'pathAria')} ref={ref}>
      {/* единственная точка входа в дерево баз */}
      <button
        type="button"
        className={`${styles.root} ${open ? styles.rootOpen : ''}`}
        onClick={() => {
          setFocus(undefined);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        title={t(lang, 'chooseBase')}
      >
        <span className={styles.rootIcon} aria-hidden="true">🗂</span>
        {rootLabel}
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>

      {path.map((node, i) => (
        <span key={node.id} className={styles.crumbItem}>
          <span className={styles.sep} aria-hidden="true">›</span>
          {/* клик по названию — просто переход в этот раздел */}
          <button
            type="button"
            className={`${styles.crumb} ${i === path.length - 1 ? styles.crumbCurrent : ''}`}
            onClick={() => onChange(node.id)}
            title={tGoTo(lang, node.name)}
          >
            {node.name}
          </button>
          {/* галочка рядом — дерево, раскрытое на этом разделе */}
          <button
            type="button"
            className={styles.crumbCaret}
            aria-expanded={open && focus === node.id}
            title={tShowInside(lang, node.name)}
            onClick={() => {
              const same = open && focus === node.id;
              setFocus(same ? undefined : node.id);
              setOpen(!same);
            }}
          >
            ▾
          </button>
        </span>
      ))}

      {open && (
        <BaseTree
          tabs={tabs}
          base={base}
          focus={focus}
          // окно остаётся открытым — по дереву можно ходить сколько нужно
          onPick={onChange}
          onClose={() => setOpen(false)}
          onCreate={onCreate}
          onMutated={onMutated}
        />
      )}
    </nav>
  );
}
