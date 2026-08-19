'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BaseTab } from './base-picker';
import { toneColor } from '@/lib/tone';
import { apiSend } from '@/lib/api';
import { useToast, useConfirm } from './ui';
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
  const toast = useToast();
  const confirm = useConfirm();
  // inline rename: the id of the base being renamed, and its draft name
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startRename = (node: TreeNode) => { setEditValue(node.name); setEditingId(node.id); };
  const cancelRename = () => setEditingId(null);
  const commitRename = async (node: TreeNode) => {
    const name = editValue.trim();
    setEditingId(null);
    if (!name || name === node.name) return;
    try {
      await apiSend('/api/bases', 'PATCH', { id: node.id, name });
      onMutated?.();
      toast(`Переименовано в «${name}»`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось переименовать');
    }
  };

  const restoreBase = async (id: string) => {
    try {
      await apiSend('/api/bases', 'DELETE', { id, restore: true });
      onMutated?.();
      toast('Восстановлено');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось восстановить');
    }
  };
  const deleteBase = async (node: TreeNode) => {
    const ok = await confirm({
      title: `Удалить базу «${node.name}»?`,
      message: 'База и её строки уедут в корзину — вернуть можно оттуда.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiSend('/api/bases', 'DELETE', { id: node.id });
      onMutated?.();
      // deleted the base that's currently open — fall back to the parent (or the
      // default built-in one), otherwise the screen sits on a base that's gone
      if (node.id === base) onPick(node.parent ?? 'market');
      toast(`База «${node.name}» удалена`, { action: { label: 'Отменить', onClick: () => restoreBase(node.id) } });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось удалить базу');
    }
  };

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
          {editingId === node.id ? (
            <input
              className={styles.renameInput}
              value={editValue}
              autoFocus
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(node);
                if (e.key === 'Escape') cancelRename();
              }}
              onBlur={() => commitRename(node)}
              onClick={(e) => e.stopPropagation()}
              aria-label="Новое название базы"
            />
          ) : (
            <button
              type="button"
              className={`${styles.node} ${node.id === base ? styles.nodeActive : ''}`}
              style={{ ['--tone']: toneColor(node.tone) } as CSSProperties}
              // like a file explorer: clicking a branch both loads its table and expands
              // it further in; the window stays open the whole time
              onClick={() => {
                onPick(node.id);
                if (hasKids && !expanded.has(node.id)) toggle(node.id);
              }}
            >
              <span className={styles.tone} aria-hidden="true" />
              <span className={styles.icon} aria-hidden="true">{hasKids ? '📁' : '📄'}</span>
              <span className={styles.name}>{node.name}</span>
              {node.builtin && <span className={styles.tag}>встроенная</span>}
            </button>
          )}
          {!node.builtin && editingId !== node.id && (
            <span className={styles.actions}>
              <button type="button" title="Переименовать" onClick={(e) => { e.stopPropagation(); startRename(node); }}>✏️</button>
              <button type="button" title="Удалить базу в корзину" onClick={(e) => { e.stopPropagation(); deleteBase(node); }}>🗑</button>
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
