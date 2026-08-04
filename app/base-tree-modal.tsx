'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BaseTab } from './base-picker';
import styles from './base-tree-modal.module.css';

interface TreeNode extends BaseTab {
  children: TreeNode[];
}

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

export default function BaseTreeModal({
  tabs,
  base,
  onPick,
  onClose,
  onCreate,
}: {
  tabs: BaseTab[];
  base: string;
  onPick: (id: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { roots, byId } = useMemo(() => buildTree(tabs), [tabs]);
  const [query, setQuery] = useState('');

  // путь до текущей базы — эти узлы раскрыты по умолчанию
  const openByDefault = useMemo(() => {
    const ids = new Set<string>();
    let cur = byId.get(base);
    while (cur) {
      ids.add(cur.id);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return ids;
  }, [base, byId]);

  const [expanded, setExpanded] = useState<Set<string>>(openByDefault);

  // Esc закрывает
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  // при поиске показываем совпадения и всех их родителей
  const matches = useMemo(() => {
    if (!q) return null;
    const keep = new Set<string>();
    for (const node of byId.values()) {
      if (node.name.toLowerCase().includes(q)) {
        keep.add(node.id);
        let p = node.parent ? byId.get(node.parent) : undefined;
        while (p) {
          keep.add(p.id);
          p = p.parent ? byId.get(p.parent) : undefined;
        }
      }
    }
    return keep;
  }, [q, byId]);

  const renderNode = (node: TreeNode, depth: number) => {
    if (matches && !matches.has(node.id)) return null;
    const isOpen = matches ? true : expanded.has(node.id);
    const hasKids = node.children.length > 0;
    return (
      <div key={node.id}>
        <div className={styles.row} style={{ paddingLeft: `${8 + depth * 18}px` }}>
          {hasKids ? (
            <button
              type="button"
              className={styles.twist}
              onClick={() => toggle(node.id)}
              aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
            >
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className={styles.twistGap} />
          )}
          <button
            type="button"
            className={`${styles.node} ${node.id === base ? styles.nodeActive : ''}`}
            onClick={() => onPick(node.id)}
          >
            <span className={styles.icon} aria-hidden="true">{hasKids ? '📁' : '📄'}</span>
            <span className={styles.name}>{node.name}</span>
            {node.builtin && <span className={styles.tag}>встроенная</span>}
          </button>
        </div>
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Выбор базы данных"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>Базы данных</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <input
          className={styles.search}
          placeholder="Поиск базы…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className={styles.tree}>
          {roots.map((n) => renderNode(n, 0))}
          {matches && matches.size === 0 && <div className={styles.empty}>Ничего не найдено</div>}
        </div>

        <div className={styles.foot}>
          <button
            type="button"
            className={styles.create}
            onClick={() => {
              onClose();
              onCreate();
            }}
          >
            + Создать базу
          </button>
          <span className={styles.hint}>Выбери таблицу — она откроется на главном экране</span>
        </div>
      </div>
    </div>
  );
}
