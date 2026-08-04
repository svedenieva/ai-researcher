'use client';

import { useMemo } from 'react';
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
  onOpenTree,
  rootLabel = 'AI-Researcher',
}: {
  tabs: BaseTab[];
  base: string;
  onChange: (id: string) => void;
  onOpenTree: () => void;
  rootLabel?: string;
}) {
  const byId = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);

  // путь от верхнего уровня до выбранной базы — крошки для быстрых переходов
  const path = useMemo(() => {
    const out: BaseTab[] = [];
    let cur = byId.get(base);
    while (cur) {
      out.unshift(cur);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return out;
  }, [base, byId]);

  return (
    <nav className={styles.crumbs} aria-label="Путь к базе">
      {/* корень открывает дерево баз в модалке */}
      <button type="button" className={styles.root} onClick={onOpenTree}>
        <span className={styles.rootIcon} aria-hidden="true">🗂</span>
        {rootLabel}
      </button>

      {path.map((node, i) => (
        <span key={node.id} className={styles.crumbItem}>
          <span className={styles.sep} aria-hidden="true">›</span>
          <button
            type="button"
            className={`${styles.crumb} ${i === path.length - 1 ? styles.crumbCurrent : ''}`}
            onClick={() => onChange(node.id)}
            title={i === path.length - 1 ? 'Текущая база' : `Перейти: ${node.name}`}
          >
            {node.name}
          </button>
        </span>
      ))}

      <button
        type="button"
        className={styles.changeBtn}
        onClick={onOpenTree}
        title="Выбрать базу из дерева"
      >
        Сменить базу
      </button>
    </nav>
  );
}
