'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BaseTab } from './base-picker';
import { toneColor } from '@/lib/tone';
import { apiSend } from '@/lib/api';
import { useToast, useConfirm } from './ui';
import { IconFolder, IconFile, IconPencil, IconMove, IconTrash, IconPlus } from './icons';
import styles from './base-tree.module.css';

export interface TreeNode extends BaseTab {
  children: TreeNode[];
}

const BUILTIN_ORDER = ['ai', 'it', 'workforce', 'market'];

// shared with the showcase page (/bases), which renders the same hierarchy
export function buildTree(tabs: BaseTab[]) {
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
  embedded = false,
}: {
  tabs: BaseTab[];
  base: string;
  /** the node to expand the tree at on open; defaults to the current base */
  focus?: string;
  onPick: (id: string) => void;
  onClose: () => void;
  /** open the create-base form; a parentId preselects that node as the parent
      (a per-node «+»), no argument creates at the root */
  onCreate: (parentId?: string) => void;
  /** base renamed/deleted — the base list needs to be re-read */
  onMutated?: () => void;
  /** render as a persistent sidebar panel (no dialog head / close / autofocus)
      instead of the drop-down window */
  embedded?: boolean;
}) {
  const { roots, byId } = useMemo(() => buildTree(tabs), [tabs]);
  const [query, setQuery] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  // inline rename: the id of the base being renamed, and its draft name
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // inline move: the id of the base being moved. The row turns into a parent
  // picker, mirroring how rename turns it into an input.
  const [movingId, setMovingId] = useState<string | null>(null);

  // Where may this base go? Anywhere except itself and its own branch —
  // otherwise the tree becomes cyclic. The server checks this too (it is the
  // authority); this only keeps impossible options out of the list.
  const moveTargets = useCallback(
    (node: TreeNode) => {
      const banned = new Set<string>([node.id]);
      const walk = (n: TreeNode) => {
        for (const c of n.children) {
          banned.add(c.id);
          walk(c);
        }
      };
      walk(node);
      return tabs.filter((t) => !banned.has(t.id) && t.id !== node.parent);
    },
    [tabs],
  );

  const commitMove = async (node: TreeNode, parent: string | null) => {
    setMovingId(null);
    if (parent === (node.parent ?? null)) return;
    try {
      await apiSend('/api/bases', 'PATCH', { id: node.id, parent });
      onMutated?.();
      const where = parent ? tabs.find((t) => t.id === parent)?.name : null;
      toast(where ? `«${node.name}» → «${where}»` : `«${node.name}» — до кореня`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося перенести базу');
    }
  };

  const startRename = (node: TreeNode) => { setEditValue(node.name); setEditingId(node.id); };
  const cancelRename = () => setEditingId(null);
  const commitRename = async (node: TreeNode) => {
    const name = editValue.trim();
    setEditingId(null);
    if (!name || name === node.name) return;
    try {
      await apiSend('/api/bases', 'PATCH', { id: node.id, name });
      onMutated?.();
      toast(`Перейменовано на «${name}»`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося перейменувати');
    }
  };

  const restoreBase = async (id: string) => {
    try {
      await apiSend('/api/bases', 'DELETE', { id, restore: true });
      onMutated?.();
      toast('Відновлено');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося відновити');
    }
  };
  const deleteBase = async (node: TreeNode) => {
    const ok = await confirm({
      title: `Видалити базу «${node.name}»?`,
      message: 'База та її рядки підуть до кошика — звідти можна повернути.',
      confirmLabel: 'Видалити',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiSend('/api/bases', 'DELETE', { id: node.id });
      onMutated?.();
      // deleted the base that's currently open — fall back to the parent (or the
      // default built-in one), otherwise the screen sits on a base that's gone
      if (node.id === base) onPick(node.parent ?? 'market');
      toast(`Базу «${node.name}» видалено`, { action: { label: 'Скасувати', onClick: () => restoreBase(node.id) } });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося видалити базу');
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
        <div className={styles.row} style={{ paddingLeft: `${8 + depth * 14}px` }}>
          {hasKids ? (
            <button
              type="button"
              className={styles.twist}
              onClick={() => toggle(node.id)}
              aria-label={isOpen ? 'Згорнути' : 'Розгорнути'}
            >
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className={styles.twistGap} />
          )}
          {movingId === node.id ? (
            <select
              className={styles.renameInput}
              defaultValue=""
              autoFocus
              aria-label={`Перенести базу «${node.name}»`}
              onChange={(e) => commitMove(node, e.target.value || null)}
              onBlur={() => setMovingId(null)}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="" disabled>Перенести до…</option>
              {node.parent && <option value="">До кореня</option>}
              {moveTargets(node).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : editingId === node.id ? (
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
              aria-label="Нова назва бази"
            />
          ) : (
            <button
              type="button"
              title={node.name}
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
              <span className={styles.icon} aria-hidden="true">{hasKids ? <IconFolder size={14} /> : <IconFile size={14} />}</span>
              <span className={styles.name}>{node.name}</span>
              {node.builtin && <span className={styles.tag}>вбудована</span>}
            </button>
          )}
          {editingId !== node.id && movingId !== node.id && (
            <span className={styles.actions}>
              {/* «+» on every node — including built-in ones — so a base can be
                  added under any node right where you are */}
              <button type="button" title={`Додати підбазу в «${node.name}»`} onClick={(e) => { e.stopPropagation(); onCreate(node.id); }}><IconPlus size={14} /></button>
              {!node.builtin && (
                <>
                  <button type="button" title="Перейменувати" onClick={(e) => { e.stopPropagation(); startRename(node); }}><IconPencil size={14} /></button>
                  <button type="button" title="Перенести до іншої гілки" onClick={(e) => { e.stopPropagation(); setMovingId(node.id); }}><IconMove size={14} /></button>
                  <button type="button" title="Видалити базу до кошика" onClick={(e) => { e.stopPropagation(); deleteBase(node); }}><IconTrash size={14} /></button>
                </>
              )}
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
    <div
      className={embedded ? styles.embedded : styles.panel}
      role={embedded ? 'navigation' : 'dialog'}
      aria-label="Бази даних"
    >
      {!embedded && (
        <div className={styles.head}>
          <span className={styles.title}>Бази даних</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
      )}

      <input
        className={styles.search}
        placeholder="Пошук бази…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={!embedded}
      />

      <div className={styles.tree}>
        {roots.map((n) => renderNode(n, 0))}
        {matches && matches.size === 0 && <div className={styles.empty}>Нічого не знайдено</div>}
      </div>

      <div className={styles.foot}>
        <button
          type="button"
          className={styles.create}
          onClick={() => {
            if (!embedded) onClose();
            onCreate();
          }}
        >
          + Створити базу
        </button>
      </div>
    </div>
  );
}
