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

// порядок встроенных баз (AI-сфера → IT-сфера → WorkOS → Рынок AI)
const BUILTIN_ORDER = ['ai', 'it', 'workforce', 'market'];

function buildTree(tabs: BaseTab[]) {
  const byId = new Map<string, TreeNode>(tabs.map((t) => [t.id, { ...t, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent ? byId.get(node.parent) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  roots.sort((a, b) => {
    if (a.builtin && b.builtin) return BUILTIN_ORDER.indexOf(a.id) - BUILTIN_ORDER.indexOf(b.id);
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
  rootLabel = 'AI-Researcher',
}: {
  tabs: BaseTab[];
  base: string;
  onChange: (id: string) => void;
  onCreate: () => void;
  rootLabel?: string;
}) {
  // индекс открытого сегмента (0 = корень «AI-Researcher»), null = закрыто
  const [openAt, setOpenAt] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { roots, byId } = useMemo(() => buildTree(tabs), [tabs]);

  // путь от верхнего уровня до выбранной базы
  const path = useMemo(() => {
    const out: TreeNode[] = [];
    let cur = byId.get(base);
    while (cur) {
      out.unshift(cur);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return out;
  }, [base, byId]);

  useEffect(() => {
    if (openAt === null) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenAt(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openAt]);

  // сегменты крошек: корень + путь. У каждого свой список того, что «внутри».
  const segments = [
    { key: '__root__', label: rootLabel, children: roots, id: null as string | null },
    ...path.map((n) => ({ key: n.id, label: n.name, children: n.children, id: n.id })),
  ];

  const pick = (id: string) => {
    onChange(id);
    setOpenAt(null);
  };

  return (
    <nav className={styles.crumbs} aria-label="Выбор базы" ref={ref}>
      {segments.map((seg, i) => (
        <span key={seg.key} className={styles.crumbItem}>
          {i > 0 && <span className={styles.sep} aria-hidden="true">›</span>}
          <div className={styles.segWrap}>
            <button
              type="button"
              className={`${styles.crumb} ${i === segments.length - 1 ? styles.crumbCurrent : ''}`}
              onClick={() => setOpenAt(openAt === i ? null : i)}
              aria-expanded={openAt === i}
              aria-haspopup="menu"
            >
              {seg.label}
              <span className={styles.caret} aria-hidden="true">▾</span>
            </button>

            {openAt === i && (
              <div className={styles.menu} role="menu">
                {seg.children.length > 0 ? (
                  seg.children.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`${styles.option} ${c.id === base ? styles.optionActive : ''}`}
                      onClick={() => pick(c.id)}
                    >
                      <span
                        className={`${styles.dot} ${styles[`dot_${c.tone}`] ?? styles.dot_sage}`}
                        aria-hidden="true"
                      />
                      {c.name}
                      {c.children.length > 0 && <span className={styles.more} aria-hidden="true">›</span>}
                    </button>
                  ))
                ) : (
                  <div className={styles.empty}>нет вложенных баз</div>
                )}
                <div className={styles.menuDiv} />
                <button
                  type="button"
                  className={styles.create}
                  onClick={() => {
                    setOpenAt(null);
                    onCreate();
                  }}
                >
                  + Создать базу
                </button>
              </div>
            )}
          </div>
        </span>
      ))}
    </nav>
  );
}
