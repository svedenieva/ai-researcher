'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BaseTab } from './base-picker';
import { toneColor } from '@/lib/tone';
import { apiSend } from '@/lib/api';
import { useToast, useConfirm } from './ui';
import { IconFolder, IconFile, IconPencil, IconMove, IconTrash, IconPlus, IconDots } from './icons';
import { useLang } from './lang-provider';
import type { Lang } from '@/lib/i18n';
import styles from './base-tree.module.css';

// all user-facing strings, in the three site languages (default uk)
const S: Record<Lang, {
  bases: string; close: string; search: string; empty: string; create: string;
  collapse: string; expand: string; builtin: string; newName: string;
  moveTo: string; toRoot: string; addSub: string; rename: string; move: string; del: string;
  undo: string; restored: string; delMsg: string;
  errMove: string; errRename: string; errRestore: string; errDelete: string;
  actionsFor: (n: string) => string; movePick: (n: string) => string;
  renamedTo: (n: string) => string; deleted: (n: string) => string; delTitle: (n: string) => string;
  movedTo: (n: string, w: string) => string; movedRoot: (n: string) => string;
  groupResearch: string; groupKnowledge: string; groupEmpty: string;
  toKnowledge: string; toResearch: string;
  movedToGroup: (n: string, g: string) => string;
}> = {
  uk: {
    bases: 'Бази даних', close: 'Закрити', search: 'Пошук бази…', empty: 'Нічого не знайдено',
    create: '+ Створити базу', collapse: 'Згорнути', expand: 'Розгорнути', builtin: 'вбудована',
    newName: 'Нова назва бази', moveTo: 'Перенести до…', toRoot: 'До кореня',
    addSub: 'Додати підбазу', rename: 'Перейменувати', move: 'Перенести', del: 'Видалити',
    undo: 'Скасувати', restored: 'Відновлено',
    delMsg: 'База та її рядки підуть до кошика — звідти можна повернути.',
    errMove: 'Не вдалося перенести базу', errRename: 'Не вдалося перейменувати',
    errRestore: 'Не вдалося відновити', errDelete: 'Не вдалося видалити базу',
    actionsFor: (n) => `Дії з базою «${n}»`, movePick: (n) => `Перенести базу «${n}»`,
    renamedTo: (n) => `Перейменовано на «${n}»`, deleted: (n) => `Базу «${n}» видалено`,
    delTitle: (n) => `Видалити базу «${n}»?`,
    movedTo: (n, w) => `«${n}» → «${w}»`, movedRoot: (n) => `«${n}» — до кореня`,
    groupResearch: 'Дослідник', groupKnowledge: 'База знань', groupEmpty: 'Порожньо — створіть базу',
    toKnowledge: 'До «Бази знань»', toResearch: 'До «Дослідника»',
    movedToGroup: (n, g) => `«${n}» → ${g}`,
  },
  ru: {
    bases: 'Базы данных', close: 'Закрыть', search: 'Поиск базы…', empty: 'Ничего не найдено',
    create: '+ Создать базу', collapse: 'Свернуть', expand: 'Развернуть', builtin: 'встроенная',
    newName: 'Новое название базы', moveTo: 'Перенести в…', toRoot: 'В корень',
    addSub: 'Добавить подбазу', rename: 'Переименовать', move: 'Перенести', del: 'Удалить',
    undo: 'Отменить', restored: 'Восстановлено',
    delMsg: 'База и её строки уйдут в корзину — оттуда можно вернуть.',
    errMove: 'Не удалось перенести базу', errRename: 'Не удалось переименовать',
    errRestore: 'Не удалось восстановить', errDelete: 'Не удалось удалить базу',
    actionsFor: (n) => `Действия с базой «${n}»`, movePick: (n) => `Перенести базу «${n}»`,
    renamedTo: (n) => `Переименовано в «${n}»`, deleted: (n) => `База «${n}» удалена`,
    delTitle: (n) => `Удалить базу «${n}»?`,
    movedTo: (n, w) => `«${n}» → «${w}»`, movedRoot: (n) => `«${n}» — в корень`,
    groupResearch: 'Исследователь', groupKnowledge: 'База знаний', groupEmpty: 'Пусто — создайте базу',
    toKnowledge: 'В «Базу знаний»', toResearch: 'В «Исследователь»',
    movedToGroup: (n, g) => `«${n}» → ${g}`,
  },
  en: {
    bases: 'Databases', close: 'Close', search: 'Search a base…', empty: 'Nothing found',
    create: '+ New base', collapse: 'Collapse', expand: 'Expand', builtin: 'built-in',
    newName: 'New base name', moveTo: 'Move to…', toRoot: 'To root',
    addSub: 'Add sub-base', rename: 'Rename', move: 'Move', del: 'Delete',
    undo: 'Undo', restored: 'Restored',
    delMsg: 'The base and its rows go to the bin — you can restore them from there.',
    errMove: 'Could not move the base', errRename: 'Could not rename',
    errRestore: 'Could not restore', errDelete: 'Could not delete the base',
    actionsFor: (n) => `Actions for “${n}”`, movePick: (n) => `Move base “${n}”`,
    renamedTo: (n) => `Renamed to “${n}”`, deleted: (n) => `Base “${n}” deleted`,
    delTitle: (n) => `Delete base “${n}”?`,
    movedTo: (n, w) => `“${n}” → “${w}”`, movedRoot: (n) => `“${n}” — to root`,
    groupResearch: 'Researcher', groupKnowledge: 'Knowledge base', groupEmpty: 'Empty — create a base',
    toKnowledge: 'To “Knowledge base”', toResearch: 'To “Researcher”',
    movedToGroup: (n, g) => `“${n}” → ${g}`,
  },
};

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

// Which sidebar group a base belongs to: «Дослідник» (working bases you make)
// or «База знань» (curated). The assignment is a per-viewer preference kept in
// localStorage (no DB column yet); the default splits built-in vs your own.
export type BaseKind = 'research' | 'knowledge';
export function defaultKind(node: { builtin?: boolean }): BaseKind {
  return node.builtin ? 'knowledge' : 'research';
}

// Forest of one kind only: a base whose parent sits in the OTHER kind (or is
// missing) becomes a top-level node here, so the two groups read as separate
// while nesting is preserved within a group.
function buildForest(tabs: BaseTab[], kindOf: (t: BaseTab) => BaseKind, want: BaseKind): TreeNode[] {
  const mine = tabs.filter((t) => kindOf(t) === want);
  const byId = new Map<string, TreeNode>(mine.map((t) => [t.id, { ...t, children: [] }]));
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
  return roots;
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
  const { lang } = useLang();
  const s = S[lang] ?? S.uk;
  const { byId } = useMemo(() => buildTree(tabs), [tabs]);
  const [query, setQuery] = useState('');

  // per-viewer group assignment (research vs knowledge), kept in localStorage
  const [kinds, setKinds] = useState<Record<string, BaseKind>>({});
  useEffect(() => {
    try { const raw = localStorage.getItem('baseKinds'); if (raw) setKinds(JSON.parse(raw)); } catch {}
  }, []);
  const kindOf = useCallback((t: BaseTab): BaseKind => kinds[t.id] ?? defaultKind(t), [kinds]);
  const setKindFor = (id: string, kind: BaseKind) =>
    setKinds((prev) => {
      const next = { ...prev, [id]: kind };
      try { localStorage.setItem('baseKinds', JSON.stringify(next)); } catch {}
      return next;
    });
  const researchRoots = useMemo(() => buildForest(tabs, kindOf, 'research'), [tabs, kindOf]);
  const knowledgeRoots = useMemo(() => buildForest(tabs, kindOf, 'knowledge'), [tabs, kindOf]);

  // each group can be collapsed; remembered per viewer
  const [collapsedGroups, setCollapsedGroups] = useState<Record<BaseKind, boolean>>({ research: false, knowledge: false });
  useEffect(() => {
    try { const raw = localStorage.getItem('baseGroupsCollapsed'); if (raw) setCollapsedGroups((p) => ({ ...p, ...JSON.parse(raw) })); } catch {}
  }, []);
  const toggleGroup = (g: BaseKind) =>
    setCollapsedGroups((prev) => {
      const next = { ...prev, [g]: !prev[g] };
      try { localStorage.setItem('baseGroupsCollapsed', JSON.stringify(next)); } catch {}
      return next;
    });
  const toast = useToast();
  const confirm = useConfirm();
  // inline rename: the id of the base being renamed, and its draft name
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // inline move: the id of the base being moved. The row turns into a parent
  // picker, mirroring how rename turns it into an input.
  const [movingId, setMovingId] = useState<string | null>(null);

  // «⋯» actions menu: which node's menu is open and where to anchor it. The tree
  // scrolls (overflow), so the menu is positioned fixed off the trigger's rect
  // rather than absolutely inside the row (which would clip).
  const [menu, setMenu] = useState<{ id: string; right: number; top: number; bottom: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu((m) => (m?.id === id ? null : { id, right: r.right, top: r.top, bottom: r.bottom }));
  };

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
      toast(where ? s.movedTo(node.name, where) : s.movedRoot(node.name));
    } catch (e) {
      toast(e instanceof Error ? e.message : s.errMove);
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
      toast(s.renamedTo(name));
    } catch (e) {
      toast(e instanceof Error ? e.message : s.errRename);
    }
  };

  const restoreBase = async (id: string) => {
    try {
      await apiSend('/api/bases', 'DELETE', { id, restore: true });
      onMutated?.();
      toast(s.restored);
    } catch (e) {
      toast(e instanceof Error ? e.message : s.errRestore);
    }
  };
  const deleteBase = async (node: TreeNode) => {
    const ok = await confirm({
      title: s.delTitle(node.name),
      message: s.delMsg,
      confirmLabel: s.del,
      danger: true,
    });
    if (!ok) return;
    try {
      await apiSend('/api/bases', 'DELETE', { id: node.id });
      onMutated?.();
      // deleted the base that's currently open — fall back to the parent (or the
      // default built-in one), otherwise the screen sits on a base that's gone
      if (node.id === base) onPick(node.parent ?? 'market');
      toast(s.deleted(node.name), { action: { label: s.undo, onClick: () => restoreBase(node.id) } });
    } catch (e) {
      toast(e instanceof Error ? e.message : s.errDelete);
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

  // Esc closes the «⋯» menu first (if open), otherwise the whole tree
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menu) setMenu(null);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, menu]);

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
              aria-label={isOpen ? s.collapse : s.expand}
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
              aria-label={s.movePick(node.name)}
              onChange={(e) => commitMove(node, e.target.value || null)}
              onBlur={() => setMovingId(null)}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="" disabled>{s.moveTo}</option>
              {node.parent && <option value="">{s.toRoot}</option>}
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
              aria-label={s.newName}
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
              {node.builtin && <span className={styles.tag}>{s.builtin}</span>}
            </button>
          )}
          {editingId !== node.id && movingId !== node.id && (
            <span className={`${styles.actions} ${menu?.id === node.id ? styles.actionsOpen : ''}`}>
              {/* one «⋯» trigger instead of a strip of icons — it stays out of the
                  name's way (a narrow sidebar has no room for four buttons) and
                  opens a menu with add-subbase / rename / move / delete */}
              <button
                type="button"
                className={styles.more}
                aria-haspopup="menu"
                aria-expanded={menu?.id === node.id}
                title={s.actionsFor(node.name)}
                onClick={(e) => { e.stopPropagation(); openMenu(node.id, e.currentTarget); }}
              >
                <IconDots size={16} />
              </button>
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
      aria-label={s.bases}
    >
      {!embedded && (
        <div className={styles.head}>
          <span className={styles.title}>{s.bases}</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label={s.close}>
            ×
          </button>
        </div>
      )}

      <input
        className={styles.search}
        placeholder={s.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={!embedded}
      />

      <div className={styles.tree} onScroll={closeMenu}>
        <div className={styles.group}>
          <button
            type="button"
            className={styles.groupLabel}
            onClick={() => toggleGroup('research')}
            aria-expanded={!collapsedGroups.research}
          >
            <span className={styles.groupTwist} aria-hidden="true">{collapsedGroups.research && !matches ? '▸' : '▾'}</span>
            {s.groupResearch}
          </button>
          {(!collapsedGroups.research || matches) && researchRoots.map((n) => renderNode(n, 0))}
          {(!collapsedGroups.research || matches) && researchRoots.length === 0 && !matches && <div className={styles.groupEmpty}>{s.groupEmpty}</div>}
        </div>
        <div className={styles.group}>
          <button
            type="button"
            className={styles.groupLabel}
            onClick={() => toggleGroup('knowledge')}
            aria-expanded={!collapsedGroups.knowledge}
          >
            <span className={styles.groupTwist} aria-hidden="true">{collapsedGroups.knowledge && !matches ? '▸' : '▾'}</span>
            {s.groupKnowledge}
          </button>
          {(!collapsedGroups.knowledge || matches) && knowledgeRoots.map((n) => renderNode(n, 0))}
        </div>
        {matches && matches.size === 0 && <div className={styles.empty}>{s.empty}</div>}
      </div>

      {/* «⋯» actions menu, positioned fixed off the trigger's rect so the tree's
          overflow doesn't clip it */}
      {menu && (() => {
        const node = byId.get(menu.id);
        if (!node) return null;
        const W = 210;
        const left = Math.max(8, Math.min(menu.right - W, window.innerWidth - W - 8));
        const openUp = menu.bottom + 200 > window.innerHeight;
        const pos: CSSProperties = openUp
          ? { left, bottom: window.innerHeight - menu.top + 6 }
          : { left, top: menu.bottom + 6 };
        return (
          <>
            <div className={styles.menuBackdrop} onClick={closeMenu} aria-hidden="true" />
            <div className={styles.menu} role="menu" style={pos} aria-label={s.actionsFor(node.name)}>
              <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { closeMenu(); onCreate(node.id); }}>
                <IconPlus size={15} /> {s.addSub}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  closeMenu();
                  const to: BaseKind = kindOf(node) === 'research' ? 'knowledge' : 'research';
                  setKindFor(node.id, to);
                  toast(s.movedToGroup(node.name, to === 'knowledge' ? s.groupKnowledge : s.groupResearch));
                }}
              >
                <IconFolder size={15} /> {kindOf(node) === 'research' ? s.toKnowledge : s.toResearch}
              </button>
              {!node.builtin && (
                <>
                  <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { closeMenu(); startRename(node); }}>
                    <IconPencil size={15} /> {s.rename}
                  </button>
                  <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { closeMenu(); setMovingId(node.id); }}>
                    <IconMove size={15} /> {s.move}
                  </button>
                  <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.danger}`} onClick={() => { closeMenu(); deleteBase(node); }}>
                    <IconTrash size={15} /> {s.del}
                  </button>
                </>
              )}
            </div>
          </>
        );
      })()}

      <div className={styles.foot}>
        <button
          type="button"
          className={styles.create}
          onClick={() => {
            if (!embedded) onClose();
            onCreate();
          }}
        >
          {s.create}
        </button>
      </div>
    </div>
  );
}
