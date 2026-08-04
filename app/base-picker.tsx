'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './base-picker.module.css';

export interface BaseTab {
  id: string;
  name: string;
  tone: string;
  builtin: boolean;
  parent: string | null;
}

interface TreeNode extends BaseTab {
  children: TreeNode[];
}

// порядок встроенных баз (руководитель: AI-сфера → IT-сфера → WorkOS → Рынок AI)
const BUILTIN_ORDER = ['ai', 'it', 'workforce', 'market'];

function buildTree(tabs: BaseTab[]): { roots: TreeNode[]; byId: Map<string, TreeNode> } {
  const byId = new Map<string, TreeNode>(tabs.map((t) => [t.id, { ...t, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent ? byId.get(node.parent) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  // встроенные в заданном порядке, потом пользовательские
  roots.sort((a, b) => {
    const ai = BUILTIN_ORDER.indexOf(a.id);
    const bi = BUILTIN_ORDER.indexOf(b.id);
    if (a.builtin && b.builtin) return ai - bi;
    if (a.builtin) return -1;
    if (b.builtin) return 1;
    return 0;
  });
  return { roots, byId };
}

export default function BasePicker({
  tabs,
  base,
  onChange,
  onCreate,
}: {
  tabs: BaseTab[];
  base: string;
  onChange: (id: string) => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const { roots, byId } = useMemo(() => buildTree(tabs), [tabs]);

  // путь от верхнего уровня до выбранной базы (для хлебных крошек)
  const path = useMemo(() => {
    const out: TreeNode[] = [];
    let cur = byId.get(base);
    while (cur) {
      out.unshift(cur);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return out;
  }, [base, byId]);

  // раскрыть путь до текущей базы при открытии
  useEffect(() => {
    if (open) setExpanded((prev) => new Set([...prev, ...path.map((p) => p.id)]));
  }, [open, path]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div className={styles.treeRow} style={{ paddingLeft: `${6 + depth * 16}px` }}>
          {node.children.length > 0 ? (
            <button type="button" className={styles.twist} onClick={() => toggle(node.id)} aria-label="Развернуть">
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className={styles.twistPlaceholder} />
          )}
          <button
            type="button"
            className={`${styles.option} ${node.id === base ? styles.optionActive : ''}`}
            onClick={() => pick(node.id)}
          >
            <span className={`${styles.dot} ${styles[`dot_${node.tone}`] ?? styles.dot_sage}`} aria-hidden="true" />
            {node.name}
          </button>
        </div>
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <nav className={styles.crumbs} aria-label="Выбор базы" ref={ref}>
      {/* хлебные крошки: полный путь до выбранной базы, каждый кликабелен */}
      {path.map((node, i) => (
        <span key={node.id} className={styles.crumbItem}>
          <span className={styles.sep} aria-hidden="true">›</span>
          <button
            type="button"
            className={`${styles.crumb} ${i === path.length - 1 ? styles.crumbCurrent : ''}`}
            onClick={() => pick(node.id)}
          >
            {node.name}
          </button>
        </span>
      ))}

      <div className={styles.pickerWrap}>
        <button
          type="button"
          className={styles.caretBtn}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Выбрать базу"
        >
          ▾
        </button>

        {open && (
          <div className={styles.menu} role="menu">
            {roots.map((n) => renderNode(n, 0))}
            <div className={styles.menuDiv} />
            <button
              type="button"
              className={styles.create}
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              + Создать базу
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
