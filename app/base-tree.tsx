'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BaseTab } from './base-picker';
import styles from './base-tree.module.css';

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

export default function BaseTree({
  tabs,
  base,
  focus,
  onPick,
  onClose,
  onCreate,
  onMutated,
}: {
  tabs: BaseTab[];
  base: string;
  /** the node to expand the tree at on open; defaults to the current base */
  focus?: string;
  onPick: (id: string) => void;
  onClose: () => void;
  onCreate: () => void;
  /** base renamed/deleted — the base list needs to be re-read */
  onMutated?: () => void;
}) {
  const { roots, byId } = useMemo(() => buildTree(tabs), [tabs]);
  const [query, setQuery] = useState('');

  // The tree is collapsed, but the path down to the open base is expanded: the
  // window should show where you currently are, rather than greeting you with a
  // flat list in which the direction hierarchy isn't visible.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const at = focus ?? base;
    // expand the node itself and the whole path leading down to it
    const path = new Set<string>([at]);
    let node = byId.get(at);
    while (node?.parent) {
      path.add(node.parent);
      node = byId.get(node.parent);
    }
    return path;
  });

  // Esc closes
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
  // when searching, show matches and all of their parents
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
            // like a file explorer: clicking a branch both loads its table and expands
            // it further in; the window stays open the whole time
            onClick={() => {
              onPick(node.id);
              if (hasKids && !expanded.has(node.id)) toggle(node.id);
            }}
          >
            <span className={styles.icon} aria-hidden="true">{hasKids ? '📁' : '📄'}</span>
            <span className={styles.name}>{node.name}</span>
            {node.builtin && <span className={styles.tag}>встроенная</span>}
          </button>
          {!node.builtin && (
            <span className={styles.actions}>
              <button type="button" title="Переименовать" onClick={async (e) => {
                e.stopPropagation();
                const name = window.prompt('Новое название базы:', node.name);
                if (name && name.trim() && name.trim() !== node.name) {
                  await fetch('/api/bases', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: node.id, name: name.trim() }) });
                  onMutated?.();
                }
              }}>✏️</button>
              <button type="button" title="Удалить базу в корзину" onClick={async (e) => {
                e.stopPropagation();
                if (!window.confirm(`Удалить базу «${node.name}» в корзину? Её строки тоже уедут в корзину, вернуть можно оттуда.`)) return;
                await fetch('/api/bases', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: node.id }) });
                onMutated?.();
                // we deleted the base that's currently open — go to the parent (or to
                // the default built-in one), otherwise the screen stays on a base that no longer exists
                if (node.id === base) onPick(node.parent ?? 'market');
              }}>🗑</button>
            </span>
          )}
        </div>
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  // Base picker window: it drops down from the name row (positioned by the parent),
  // but behaves like a window — navigating the tree doesn't close it; it can be
  // closed with the cross, a click outside, or Esc.
  return (
    <div className={styles.panel} role="dialog" aria-label="Выбор базы данных">
      <div className={styles.head}>
        <span className={styles.title}>Базы данных</span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
          ×
        </button>
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
      </div>
    </div>
  );
}
