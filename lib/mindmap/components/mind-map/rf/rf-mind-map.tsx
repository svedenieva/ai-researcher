"use client";

import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  ReactFlow,
  SelectionMode,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
  useNodesInitialized,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { MindMapNode } from "../types";
import {
  outlineToRf,
  rfToOutline,
  type RfNode,
  type RfEdge,
} from "./mindmap-to-rf";
import { layoutElk } from "./layout-elk";
import { MindNode } from "./mind-node";
import { cn } from "../../../lib/cn";
import { SearchPanel } from "./search-panel";
import { HotkeysHelp } from "./hotkeys-help";
import {
  MindMapCtx,
  type MindMapActions,
  type MenuSection,
} from "./mind-map-context";
import {
  addChild,
  addSibling,
  addSiblingBefore,
  addRoot,
  removeNode,
  removeKeepChildren,
  renameNode,
  moveNode,
  moveNodeAsSibling,
  insertParent,
  reorderSibling,
  indentNode,
  outdentNode,
  detachToRoot,
  extractStyle,
  applyStyle,
  applySelection,
  serializeSubtree,
  insertSubtree,
} from "./tree-ops";
import {
  setTextColor,
  setLineColor,
  resetLineColor,
  setBackgroundColor,
} from "./color-ops";
import {
  toggleBold,
  toggleItalic,
  setFontSize,
  setShape,
  setBorderStyle,
  setBranchType,
  setFontFamily,
  setCustomPosition,
  setOffset,
  clearCustomPosition,
  toggleTag,
  toggleIcon,
  setLink,
  type BorderStyle,
  type BranchType,
} from "./style-ops";
import { useMindMapStore } from "./store";
import { useAutoLayout } from "./use-auto-layout";
import {
  navigate,
  toggleExpand,
  expandToLevel,
  expandSubtreeToLevel,
  filterCollapsed,
  buildMaps,
} from "./tree-nav";
import { FrameOverlay, setFrame, type FrameType } from "./frames";
import type { Shape as ShapeType } from "./style-ops";

export interface RfMindMapProps {
  outline: MindMapNode[];
  title?: string;
  className?: string;
  editable?: boolean;
  liveUpdate?: boolean;
  isLive?: boolean;
  /** Live session id — used to POST deleted-signature labels. */
  sessionId?: string;
  /** ISO-like language hint ("ru" | "uk" | "en", default "ru"). */
  language?: string;
  onChange?: (outline: MindMapNode[]) => void;
  /** Remote collaborators keyed by the node sourceId they are on (presence). */
  presence?: Record<string, PresenceRingUser[]>;
  /** Report which node (sourceId) the local user is selecting/editing. */
  onActiveNode?: (sourceId: string | null) => void;
  /** Free-form relationship arrows between nodes (controlled by the parent). */
  connections?: Connection[];
  /** Emitted whenever a connection is created / edited / deleted. */
  onConnectionsChange?: (connections: Connection[]) => void;
}

/** Minimal shape the node badge needs from a presence user. */
export type PresenceRingUser = { id: string; name: string; image?: string; color: string };

export interface RfMindMapHandle {
  exportAs: (type: "png" | "svg" | "pdf" | "json") => Promise<void>;
  undo: () => void;
  redo: () => void;
  /** Surgically rename the depth-0 root node. Used by the toolbar
   *  title input so editing it stays in sync with the central node
   *  pill without paying for a full outline-prop re-sync per keystroke.
   *  Live edits skip the history snapshot — call commitHistory() on
   *  blur/Enter so a single Ctrl+Z reverts the whole rename atomically. */
  renameRoot: (label: string) => void;
  /** Push a history snapshot of the current store state. Call after a
   *  burst of live edits (e.g. when the toolbar title input loses
   *  focus) so undo/redo collapses the burst into one atomic step. */
  commitHistory: () => void;
  /** Toggle the keyboard-shortcut help modal. Page-level "?" button
   *  calls this so the trigger can live next to the toolbar without
   *  duplicating the modal's state in two trees. */
  toggleHotkeysHelp: () => void;
  /** Create a node from an external control (e.g. a header "+ Add node"
   *  button). Adds a child to the selected node, or a new root when
   *  nothing is selected. Bypasses the keydown handler entirely so it
   *  works even if a stale edit/typing target would swallow Tab. */
  addNode: () => void;
  /** Create a relationship arrow between the two selected nodes (first → second,
   *  in selection order). No-op unless at least two nodes are selected. */
  connectSelected: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA"
  );
}

import { TreeEdge } from "./tree-edge";
import { LinkEdge, type LinkEdgeData } from "./link-edge";
import type { Connection } from "../../../lib/yjs-mindmap";
import { apiFetch } from "../../../lib/api";
import {
  TRANSITION_CSS,
  SNAP_BACK_RADIUS_PX,
  DWELL_MS,
  SIBLING_BAND_PX,
  CHILD_ZONE_FRACTION,
  PHANTOM_X_ZONE_MULT,
  Y_OFFSET_THRESHOLD_PX,
  GROUP_GAP_PX,
  FALLBACK_NODE_WIDTH,
} from "./rf-mind-map-constants";
import { downloadBlob, downloadUrl } from "../../../lib/download";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

const nodeTypes = { mind: MindNode };
const edgeTypes = { step: TreeEdge, link: LinkEdge };

function RfMindMapInner(
  {
    outline,
    title = "Mind Map",
    className,
    editable = false,
    liveUpdate = false,
    isLive = false,
    sessionId,
    language = "ru",
    onChange,
    presence,
    onActiveNode,
    connections,
    onConnectionsChange,
  }: RfMindMapProps,
  ref: React.Ref<RfMindMapHandle>,
) {
  const storeNodes = useMindMapStore((s) => s.nodes);
  const storeEdges = useMindMapStore((s) => s.edges);

  // ── Connections (relationship arrows) — controlled by the parent ──
  // connectionsRef mirrors the prop so imperative handlers read the latest
  // without stale closures; selectionOrderRef captures multi-select ORDER
  // (RF's onSelectionChange gives an ordered array) so A→B is well-defined.
  const connectionsRef = useRef<Connection[]>(connections ?? []);
  connectionsRef.current = connections ?? [];
  const onConnectionsChangeRef = useRef(onConnectionsChange);
  onConnectionsChangeRef.current = onConnectionsChange;
  const selectionOrderRef = useRef<string[]>([]);
  const emitConnections = useCallback((next: Connection[]) => {
    connectionsRef.current = next;
    onConnectionsChangeRef.current?.(next);
  }, []);
  const upsertConnection = useCallback((id: string, patch: Partial<Connection>) => {
    emitConnections(connectionsRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, [emitConnections]);
  const deleteConnection = useCallback((id: string) => {
    emitConnections(connectionsRef.current.filter((c) => c.id !== id));
  }, [emitConnections]);
  const createConnectionBetween = useCallback((from: string, to: string) => {
    if (!from || !to || from === to) return;
    // Both endpoints must still exist (guards a concurrent delete of a selected
    // node — else we'd create a connection that's dropped on the next rebuild).
    const ids = new Set(useMindMapStore.getState().nodes.map((n) => n.id));
    if (!ids.has(from) || !ids.has(to)) return;
    const exists = connectionsRef.current.some((c) => c.from === from && c.to === to);
    if (exists) return;
    const id = "x" + Math.random().toString(36).slice(2, 10);
    emitConnections([...connectionsRef.current, { id, from, to }]);
  }, [emitConnections]);

  // Declared early so drag handlers (further down) can toggle the
  // `.mind-dragging` class on the canvas wrapper to kill CSS transitions
  // during drag — the biggest drag lag cause on 300+ node maps.
  const wrapperRef = useRef<HTMLDivElement>(null);
  // rAF throttle refs for rigid-group drag. Coalescing mouse-move ticks to
  // one setGraph per animation frame avoids array-spread of all nodes on
  // every browser mouse event (which can fire > 60/s on high-DPI mice).
  const pendingDragPayloadRef = useRef<{
    dx: number;
    dy: number;
    nodeId: string;
  } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  // Separate rAF ref for the live-sibling-reorder preview (otherwise the
  // rigid-group callback races with it and writes the dragged-subtree's
  // homes while we're trying to shift sibling slots).
  const liveReorderRafRef = useRef<number | null>(null);
  const pendingLiveReorderRef = useRef<Map<
    string,
    { x: number; y: number }
  > | null>(null);
  // A second, coarser throttle for the FULL `onNodeDrag` body (drop-target
  // detection scans every node twice, so on 500+ node maps it dominates
  // drag CPU even after rigid-group setGraph was throttled). When a tick
  // is already scheduled for this frame we skip the whole body — RF keeps
  // moving the primary node through its own internal state, so visual
  // responsiveness is unaffected.
  const dragTickPendingRef = useRef(false);
  // During drag we stop syncing RF's per-tick position changes into
  // Zustand — the biggest remaining cost on large maps. React Flow itself
  // keeps the dragged node visually in sync through its own internal
  // state, so skipping these store writes does NOT freeze anything; we
  // flush the final positions in `onNodeDragStop`. A ref (not state) so
  // toggling it never triggers a React re-render.
  const isDraggingRef = useRef(false);
  // Transient interaction state is declared up-front (earlier than other
  // refactor-unrelated state) because the `nodes` useMemo below folds it
  // into `data.raw.data` so MindNode can read it from props instead of
  // consuming a context that churns on every selection change.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Multi-selection mirror — onSelectionChange writes the full set of
  // currently-selected node ids into this ref. Drag/delete handlers read
  // from it instead of filtering `n.selected` on the store nodes, because
  // selection state can lag the store after a layout/setGraph round-trip.
  // Always reflects the latest set without triggering re-renders.
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const multiSelectionRef = useRef<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    mode: "child" | "before" | "after";
  } | null>(null);
  const [focusBranchId, setFocusBranchId] = useState<string | null>(null);
  const collapsed = useMemo(
    () => filterCollapsed(storeNodes, storeEdges),
    [storeNodes, storeEdges],
  );
  // Apply focus mode classes
  const focused = useMemo(() => {
    if (!focusBranchId) return collapsed;
    // Collect all descendants of focusBranchId
    const focusedIds = new Set<string>([focusBranchId]);
    const childMap = new Map<string, string[]>();
    for (const e of collapsed.edges) {
      const arr = childMap.get(e.source) ?? [];
      arr.push(e.target);
      childMap.set(e.source, arr);
    }
    const stack = [...(childMap.get(focusBranchId) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      focusedIds.add(id);
      for (const c of childMap.get(id) ?? []) stack.push(c);
    }
    return {
      nodes: collapsed.nodes.map((n) => ({
        ...n,
        className: focusedIds.has(n.id) ? "mind-focused" : undefined,
      })),
      edges: collapsed.edges.map((e) => ({
        ...e,
        className: focusedIds.has(e.target) ? "mind-focused-edge" : undefined,
      })),
    };
  }, [collapsed, focusBranchId]);

  // Propagate left-bracket frames down the tree: any node whose nearest
  // bracket-bearing ancestor (including self) has square-bracket-left or
  // curved-bracket-left gets `_inheritedFrame` stamped into its raw.data so
  // TreeEdge can render the bracket on the edge leading into this node.
  const { nodes, edges } = useMemo(() => {
    const parentOf = new Map<string, string>();
    const childMap = new Map<string, string[]>();
    for (const e of focused.edges) {
      parentOf.set(e.target, e.source);
      const arr = childMap.get(e.source) ?? [];
      arr.push(e.target);
      childMap.set(e.source, arr);
    }
    // `hasChildren` must reflect the REAL tree (including collapsed
    // subtrees), otherwise collapsed nodes lose their "+" expand button.
    // Use the raw store edges, not `focused.edges` (which is filtered).
    const fullChildMap = new Map<string, string[]>();
    for (const e of storeEdges) {
      const arr = fullChildMap.get(e.source) ?? [];
      arr.push(e.target);
      fullChildMap.set(e.source, arr);
    }
    const ownFrameOf = new Map<string, string>();
    for (const n of focused.nodes) {
      const f = n.data?.raw?.data?.frame;
      if (typeof f === "string") ownFrameOf.set(n.id, f);
    }
    const inheritedOf = new Map<string, string>();
    const resolve = (id: string): string => {
      const cached = inheritedOf.get(id);
      if (cached !== undefined) return cached;
      const own = ownFrameOf.get(id);
      if (own === "square-bracket-left" || own === "curved-bracket-left") {
        inheritedOf.set(id, own);
        return own;
      }
      const parent = parentOf.get(id);
      const result = parent ? resolve(parent) : "none";
      inheritedOf.set(id, result);
      return result;
    };
    for (const n of focused.nodes) resolve(n.id);

    // Precompute progress aggregates per node. Task progress must count
    // collapsed descendants too, otherwise a collapsed subtree with tasks
    // shows "done 0 / total 0" until expanded. Walk the FULL tree via
    // storeNodes + fullChildMap.
    const fullNodesById = new Map(storeNodes.map((n) => [n.id, n]));
    const progressMap = new Map<string, { done: number; total: number }>();
    const computeProgress = (id: string): { done: number; total: number } => {
      const existing = progressMap.get(id);
      if (existing) return existing;
      let done = 0;
      let total = 0;
      const kids = fullChildMap.get(id);
      if (kids) {
        for (const kid of kids) {
          const kidNode = fullNodesById.get(kid);
          const kd = kidNode?.data.raw.data as
            | Record<string, unknown>
            | undefined;
          if (kd?.task === true) {
            total++;
            if (kd.taskStatus === "done") done++;
          }
          const sub = computeProgress(kid);
          done += sub.done;
          total += sub.total;
        }
      }
      const out = { done, total };
      progressMap.set(id, out);
      return out;
    };
    for (const n of storeNodes) computeProgress(n.id);

    const patchedNodes = focused.nodes.map((n) => {
      const inherited = inheritedOf.get(n.id);
      const hasChildren = (fullChildMap.get(n.id)?.length ?? 0) > 0;
      const prog = progressMap.get(n.id) ?? { done: 0, total: 0 };
      // Transient interaction state (edit / select / drop) folded into
      // data so MindNode reads it from props. Without this, the `actions`
      // context value is stable (good — no cascade re-render) but
      // `actions.editingId`/`selectedId` close over the old values and
      // never update, breaking edit mode and selection visuals.
      const dropMode = dropTarget?.id === n.id ? dropTarget.mode : null;
      const isSelected = selectedId === n.id;
      const isEditing = editingId === n.id;

      const prev = n.data.raw.data ?? {};
      // Presence: remote collaborators sitting on this node (keyed by sourceId).
      const sid = prev.sourceId as string | undefined;
      const pres = (sid && presence?.[sid]) || undefined;
      const presSig = pres ? pres.map((p) => p.id).join(",") : "";
      const sameFrame =
        !inherited ||
        inherited === "none" ||
        prev._inheritedFrame === inherited;
      const sameHasChildren = prev._hasChildren === hasChildren;
      const sameProg =
        prev._progressDone === prog.done && prev._progressTotal === prog.total;
      const sameDropMode = prev._dropMode === dropMode;
      const sameSelected = prev._isSelected === isSelected;
      const sameEditing = prev._isEditing === isEditing;
      const samePresence = (prev._presenceSig ?? "") === presSig;
      if (
        sameFrame &&
        sameHasChildren &&
        sameProg &&
        sameDropMode &&
        sameSelected &&
        sameEditing &&
        samePresence
      ) {
        return n;
      }
      return {
        ...n,
        data: {
          ...n.data,
          raw: {
            ...n.data.raw,
            data: {
              ...prev,
              ...(inherited &&
                inherited !== "none" && { _inheritedFrame: inherited }),
              _hasChildren: hasChildren,
              _progressDone: prog.done,
              _progressTotal: prog.total,
              _dropMode: dropMode,
              _isSelected: isSelected,
              _isEditing: isEditing,
              _presence: pres,
              _presenceSig: presSig,
            },
          },
        },
      };
    });
    return { nodes: patchedNodes, edges: focused.edges };
  }, [focused, storeNodes, storeEdges, dropTarget, selectedId, editingId, presence]);

  // Connection arrows → React Flow edges of type "link". Computed SEPARATELY
  // from the big node/edge memo (so connection changes never re-run that) and
  // NEVER fed into ELK layout — they're combined only at the <ReactFlow> prop.
  // Geometry is resolved inside LinkEdge via useInternalNode, so these carry no
  // positions; edit callbacks are threaded through edge.data.
  const connectionEdges = useMemo(() => {
    const list = connections ?? [];
    if (!list.length) return [] as RfEdge[];
    return list.map((c) => ({
      id: `conn-${c.id}`,
      source: c.from,
      target: c.to,
      type: "link",
      selectable: true,
      data: {
        connId: c.id,
        label: c.label,
        curve: c.curve,
        width: c.width,
        color: c.color,
        editable,
        onCurve: (id: string, curve: { dx: number; dy: number }) => upsertConnection(id, { curve }),
        onLabel: (id: string, label: string) => upsertConnection(id, { label: label || undefined }),
        onColor: (id: string, col: string) => upsertConnection(id, { color: col }),
        onWidth: (id: string, w: number) => upsertConnection(id, { width: w }),
        onDelete: (id: string) => deleteConnection(id),
      } as LinkEdgeData,
    })) as RfEdge[];
  }, [connections, editable, upsertConnection, deleteConnection]);

  const allEdges = useMemo(
    () => (connectionEdges.length ? [...edges, ...connectionEdges] : edges),
    [edges, connectionEdges],
  );

  const setGraph = useMindMapStore((s) => s.setGraph);
  const applyNodeChanges = useMindMapStore((s) => s.applyNodeChanges);
  const applyEdgeChanges = useMindMapStore((s) => s.applyEdgeChanges);

  // Broadcast the locally-active node for presence. selectedId/editingId are
  // React Flow ids; map to the persistent sourceId the room keys presence by.
  useEffect(() => {
    if (!onActiveNode) return;
    const activeRfId = editingId ?? selectedId;
    if (!activeRfId) { onActiveNode(null); return; }
    const node = useMindMapStore.getState().nodes.find((n) => n.id === activeRfId);
    const sid = (node?.data?.raw?.data as { sourceId?: string } | undefined)?.sourceId;
    onActiveNode(sid ?? null);
  }, [selectedId, editingId, onActiveNode]);
  // RF instance — used to call fitView() once AFTER the post-measure
  // relayout has settled, so the viewport never fits an in-flight
  // pre-measure layout.
  const rf = useReactFlow<RfNode, RfEdge>();
  // RF v12: returns true once EVERY node has been measured (height +
  // width committed by the ResizeObserver). Gating post-measure relayout
  // on this hook (instead of the prior `some(n => n.measured)` heuristic
  // with a 100 ms timeout) eliminates the "first edit shifts the whole
  // map" bug — without it, the post-measure pass can run with PARTIAL
  // measurements (estimated sizes for the unmeasured nodes), and the
  // user's first edit later runs with FULL measurements, producing a
  // different layout that visibly jumps under a static viewport.
  const nodesInitialized = useNodesInitialized();

  // Previously filtered `type="position"` changes during drag to reduce
  // Zustand writes, but that broke the visual: primary dragged node's
  // RF-internal position couldn't sync back to Zustand, and the stale
  // `nodes` prop kept teleporting it to its pre-drag slot while its
  // descendants (moved by our rigid-group code) followed the cursor.
  // The real wins come from `onlyRenderVisibleElements` + rAF throttle
  // + transition-off during drag, not from filtering position changes.
  //
  // We DO peel off `select` changes here to mirror them into a ref —
  // onSelectionChange is async / batched / sometimes briefly emits an
  // empty list between drags, which made `selectedIdsRef` unreliable
  // for multi-select drag/delete (see "first drag OK, second drag only
  // moves one node" bug). NodeChange events of type 'select' are the
  // authoritative source from RF and arrive synchronously per change.
  const onNodesChange = useCallback(
    (changes: Parameters<typeof applyNodeChanges>[0]) => {
      for (const ch of changes) {
        if (ch.type === "select") {
          if (ch.selected) selectedIdsRef.current.add(ch.id);
          else selectedIdsRef.current.delete(ch.id);
        }
      }
      applyNodeChanges(changes);
    },
    [applyNodeChanges],
  );
  const undo = useMindMapStore((s) => s.undo);
  const redo = useMindMapStore((s) => s.redo);
  // Reactive selectors so the toolbar buttons re-render their disabled
  // state as the history stack moves (store's canUndo()/canRedo() are
  // plain functions and don't subscribe).
  const canUndo = useMindMapStore((s) => s.historyIndex > 0);
  const canRedo = useMindMapStore(
    (s) => s.historyIndex < s.history.length - 1,
  );

  const [ready, setReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hotkeysHelpOpen, setHotkeysHelpOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    ids: string[];
    label: string;
    keepChildren: boolean;
  } | null>(null);

  // Ctrl/Cmd+Shift+F — open search. Avoids browser-reserved Ctrl+F
  // (page find) and Ctrl+K (address bar in Firefox).
  useEffect(() => {
    const capture = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && !e.altKey && e.code === "KeyF") {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, []);
  const [, setMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    isRoot: boolean;
    section: string;
  } | null>(null);
  const styleClipboardRef = useRef<Record<string, unknown> | null>(null);

  const mountedRef = useRef(true);
  const suppressNextSyncRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const rootDragRef = useRef<{
    startX: number;
    startY: number;
    descendants: Map<string, { x: number; y: number }>;
  } | null>(null);
  const nonRootDragRef = useRef<{
    nodeId: string;
    homePos: { x: number; y: number };
    // Auto slot position at drag-start (homePos minus dragged's own
    // offsetX/Y). Used to build Y_orig in auto-slot space so live-preview
    // shifts don't corrupt sibling personal-touch offsets, and as the
    // column X anchor for ghost / phantom rendering.
    homeAutoY: number;
    homeAutoX: number;
    descendants?: Map<string, { x: number; y: number }>;
    // Pre-drag positions of every node in the rigid drag-group: the
    // dragged node, all multi-selected non-root nodes, AND the full
    // subtree of every selected node. `onNodeDrag` applies the same
    // delta to every entry each frame. `onNodeDragStop` uses it to
    // restore positions on snap-back.
    selectedHomes?: Map<string, { x: number; y: number }>;
    // Subset of `selectedHomes`: only the explicitly-selected non-root
    // node ids (no descendants). On drop each of THESE gets its own
    // setOffset; their descendants follow via the offset cascade in
    // layout-elk and must NOT receive an explicit per-node offset
    // (would double-apply the delta).
    selectedTopIds?: string[];
    // Pre-drag parent — used to ignore "drop on current parent" as a no-op
    // reparent (MindNode treats that as snap-back).
    parentId?: string;
    // Pre-drag positions of every sibling in the parent group — used by
    // the live-reorder preview to slot them into new positions each tick.
    // `y` is the displayed Y (slot + own offset). `autoY` is the slot
    // Y alone — needed because each sibling has its OWN phantom slot
    // (auto position) AND its OWN real position (displayed). Reorders
    // operate on slot Y; offsets are preserved on top.
    siblingHomes?: Map<
      string,
      { x: number; y: number; autoY: number; h: number }
    >;
    // For each sibling, a snapshot of its descendants' home positions, so
    // shifting a sibling during live-preview can shift its entire subtree
    // by the same delta (otherwise subtrees overlap neighbouring rows).
    siblingSubtreeHomes?: Map<string, Map<string, { x: number; y: number }>>;
    draggedHeight?: number;
    // Last-computed phantom drop target (column X, slot Y). Updated on
    // every drag tick; used by drag-stop to decide snap-to-phantom vs.
    // snap-back. `phantomIdx` is the insertion index within the sibling
    // group (0..siblings.length).
    phantomX?: number;
    phantomY?: number;
    phantomIdx?: number;
  } | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  } | null>(null);
  // Tracks the current hover candidate during a drag. A candidate is only
  // promoted to `dropTarget` once it has stayed put for DWELL_MS. Cleared
  // whenever the cursor leaves all hit-zones.
  const dwellRef = useRef<{
    id: string;
    mode: "child" | "before" | "after";
    at: number;
  } | null>(null);
  // Tracks whether Option/Alt is currently held. When held, magnetism is
  // disabled for the rest of the drag — the node pins at its drop position
  // without trying to attach to another node.
  const altDownRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const relayout = useCallback(
    async (
      ns: RfNode[],
      es: RfEdge[],
    ): Promise<{ nodes: RfNode[]; edges: RfEdge[] }> => {
      // Layout only visible nodes — collapsed subtrees don't take space
      const visible = filterCollapsed(ns, es);
      const laid = await layoutElk(visible.nodes, visible.edges);
      if (!mountedRef.current) return { nodes: ns, edges: es };
      // Resolve cross-branch collisions among visible nodes only (hidden
      // collapsed children sit at stale positions and must be excluded).
      // MindNode-like: Walker tidy-tree anti-overlap in layoutElk handles
      // all subtree collisions. The previous pairwise resolveCollisions
      // pass fought ELK's packing and caused jitter — removed.
      const posMap = new Map(laid.nodes.map((n) => [n.id, n.position]));
      const merged = ns.map((n) => {
        const pos = posMap.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
      setGraph(merged, es, true);
      return { nodes: merged, edges: es };
    },
    [setGraph],
  );

  const lastSyncedOutlineRef = useRef<unknown>(null);
  useEffect(() => {
    if (suppressNextSyncRef.current) {
      suppressNextSyncRef.current = false;
      lastSyncedOutlineRef.current = outline;
      return;
    }
    // We used to bail out entirely while editingId was set, to protect an
    // in-progress edit. But that also froze ALL incoming remote updates — a
    // node an agent/peer changed wouldn't update live until a reload (only a
    // reload re-seeds), and a stale editingId froze the map indefinitely.
    // Instead we now DO apply remote updates, and just preserve the one node
    // being edited (its text + position) in the merge below, so typing isn't
    // clobbered. Node ids are stable, so editingId stays valid across rebuild.
    // Skip re-sync when editable + ready, as long as the outline reference is
    // unchanged. A local edit re-uses the same outline object (emitChange), so
    // it skips; a genuine remote update arrives as a NEW outline object (the
    // collab layer calls setOutline), so it rebuilds. This reference check
    // holds in liveUpdate (collab) mode too — it already distinguishes local
    // from remote, so we must NOT force a rebuild just because liveUpdate is on
    // (doing so regenerated ids on every local edit and broke node creation).
    if (
      editable &&
      ready &&
      lastSyncedOutlineRef.current === outline
    ) {
      return;
    }
    lastSyncedOutlineRef.current = outline;
    // Node ids are stable (sourceId-based), so a rebuild from a remote update
    // reuses the same ids for unchanged nodes — carry over their selection and
    // measured size so a peer's edit no longer clobbers the local user's
    // selection or flashes a re-measure. Stale ids get pruned below.
    const prevById = new Map(
      useMindMapStore.getState().nodes.map((n) => [n.id, n] as const),
    );
    let cancelled = false;
    (async () => {
      const { nodes: allNodes, edges: allEdges } = outlineToRf(outline, title);
      // Layout only VISIBLE nodes (collapsed children excluded) for compact spacing.
      // Hidden nodes keep position {0,0} — they'll be relaid out when expanded.
      const visible = filterCollapsed(allNodes, allEdges);
      const laid = await layoutElk(visible.nodes, visible.edges);
      if (cancelled || !mountedRef.current) return;
      // MindNode-like: Walker tidy-tree anti-overlap in layoutElk handles
      // all subtree collisions. The previous pairwise resolveCollisions
      // pass fought ELK's packing and caused jitter — removed.
      const posMap = new Map(laid.nodes.map((n) => [n.id, n.position]));
      // Cheap signature of the render-affecting data (styles/meta live in raw.data).
      const sig = (raw: unknown) => {
        try { return JSON.stringify((raw as { data?: unknown })?.data ?? null); } catch { return ""; }
      };
      const merged = allNodes.map((n) => {
        const pos = posMap.get(n.id);
        const prev = prevById.get(n.id);
        // The node currently being edited keeps its local text + position so a
        // concurrent remote rebuild doesn't overwrite what the user is typing.
        if (prev && editingId === n.id) {
          return { ...n, position: prev.position, data: { ...n.data, label: prev.data.label, raw: prev.data.raw } };
        }
        // IDENTITY PRESERVATION: when a node's rendered content (label + styles/
        // meta + hasChildren) and its position are unchanged, reuse the EXACT
        // prev object. React Flow and the node-map memo both diff by reference,
        // so a remote edit to ONE node re-renders only that node instead of all
        // N. Replacing every node object on each remote update is what froze
        // large (1000+ node) maps and made a peer's rename appear not to apply.
        if (prev && editingId !== prev.id) {
          const np = pos ?? n.position;
          if (
            prev.position.x === np.x && prev.position.y === np.y &&
            prev.data.label === n.data.label &&
            prev.data.hasChildren === n.data.hasChildren &&
            sig(prev.data.raw) === sig(n.data.raw)
          ) {
            return prev;
          }
        }
        return {
          ...n,
          ...(pos ? { position: pos } : null),
          ...(prev?.selected ? { selected: true } : null),
          ...(prev?.measured ? { measured: prev.measured } : null),
        };
      });
      // Keep only selection ids that still exist in the rebuilt graph.
      const liveIds = new Set(merged.map((n) => n.id));
      selectedIdsRef.current = new Set(
        [...selectedIdsRef.current].filter((id) => liveIds.has(id)),
      );
      setGraph(merged, allEdges, true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [outline, title, editable, liveUpdate, ready, setGraph, editingId]);

  // Wait for RF's `useNodesInitialized` rather than guessing per-tick how
  // many nodes have been measured — the hook flips true once RF has real
  // dimensions for every node. Then layoutElk + a single rAF-deferred
  // fitView. Guard by outline ref so opening a different file in the
  // same component instance re-runs the layout (a `boolean` ref would
  // latch true forever).
  const didPostMeasureRef = useRef<unknown>(null);
  // Toggle viewport culling. Off during first measure round so RF mounts
  // every node and Phase-2 layoutElk gets real heights (BUG-01 fix). Once
  // post-measure relayout has applied, flip on so drag/pan only re-render
  // visible nodes — the difference between rendering 300 vs 30 DOM nodes
  // per frame is the main drag-lag source on big maps.
  const [cullOffscreen, setCullOffscreen] = useState(false);
  useEffect(() => {
    if (!ready || !nodesInitialized) return;
    if (!mountedRef.current) return;
    const cur = useMindMapStore.getState();
    // Run the post-measure relayout + fitView ONCE per file, NOT on every remote
    // edit. Keying on the `outline` ref re-ran this on every peer keystroke,
    // which re-fitted the viewport (the map visibly "jumped"), toggled culling
    // and briefly mounted every node — the jank users read as "it didn't update
    // / it jumps around". The set of ROOT node ids is stable while editing one
    // map but changes when a different map is opened, so it re-runs only then.
    const rootSig = cur.nodes.filter((n) => n.data.depth === 0).map((n) => n.id).join(",");
    if (didPostMeasureRef.current === rootSig) return;
    didPostMeasureRef.current = rootSig;
    setCullOffscreen(false);
    const visible = filterCollapsed(cur.nodes, cur.edges);
    layoutElk(visible.nodes, visible.edges).then((laid) => {
      if (!mountedRef.current) return;
      const posMap = new Map(laid.nodes.map((n) => [n.id, n.position]));
      const merged = cur.nodes.map((n) => {
        const pos = posMap.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
      setGraph(merged, cur.edges, false);
      requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        rf.fitView({ padding: 0.2 });
        setCullOffscreen(true);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, nodesInitialized, outline, setGraph]);

  // Catches content-driven measured.* shifts the post-measure effect above misses.
  const onAutoLayoutDone = useCallback(
    (ns: RfNode[], es: RfEdge[]) => {
      if (!mountedRef.current) return;
      setGraph(ns, es, false);
    },
    [setGraph],
  );
  useAutoLayout({
    enabled: ready && nodesInitialized,
    onLaidOut: onAutoLayoutDone,
  });

  const emitChange = useCallback((ns: RfNode[], es: RfEdge[]) => {
    if (!onChangeRef.current) return;
    const out = rfToOutline(ns, es);
    // NOTE: we intentionally do NOT set suppressNextSyncRef here. The collab
    // wrapper's onChange writes to Yjs but never re-feeds the outline, so the
    // flag was never consumed by a follow-up effect run — it lingered and then
    // swallowed the NEXT genuine remote update (a peer's/agent's edit), which
    // is why two windows drifted out of sync. Local writes are already ignored
    // by the Yjs observer (transaction.local), so no suppression is needed.
    onChangeRef.current(out);
  }, []);

  const beginEdit = useCallback((id: string) => setEditingId(id), []);
  const cancelEdit = useCallback(() => {
    editingIdRef.current = null;
    setEditingId(null);
  }, []);
  const commitEdit = useCallback(
    (id: string, label: string) => {
      editingIdRef.current = null;
      setEditingId(null);
      const cur = useMindMapStore.getState();
      const renamed = renameNode(cur.nodes, id, label);
      setGraph(renamed, cur.edges, true);
      // No relayout here. Caller decides:
      // - Enter/Tab → addChild/addSibling does relayout
      // - blur/Escape → node calls relayoutAfterEdit
    },
    [setGraph],
  );
  const relayoutAfterEdit = useCallback(() => {
    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      const cur = useMindMapStore.getState();
      relayout(cur.nodes, cur.edges).then((laid) => {
        if (mountedRef.current) emitChange(laid.nodes, laid.edges);
      });
    });
  }, [relayout, emitChange]);

  const openMenuForNode = useCallback(
    (nodeId: string, section: MenuSection = "all") => {
      const el = document.querySelector(
        `.react-flow__node[data-id="${nodeId}"]`,
      ) as HTMLElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cur = useMindMapStore.getState();
      const node = cur.nodes.find((n) => n.id === nodeId);
      setSelectedId(nodeId);
      setMenu({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
        nodeId,
        isRoot: node?.data.depth === 0,
        section,
      });
    },
    [],
  );

  const mutate = useCallback(
    async (
      result: { nodes: RfNode[]; edges: RfEdge[] },
      afterLayout?: () => void,
    ) => {
      const laid = await relayout(result.nodes, result.edges);
      afterLayout?.();
      emitChange(laid.nodes, laid.edges);
    },
    [relayout, emitChange],
  );

  // const applyNodesOp = useCallback(
  //   (fn: (nodes: RfNode[], edges: RfEdge[]) => { nodes: RfNode[]; edges: RfEdge[] }) => {
  //     const cur = useMindMapStore.getState();
  //     const res = fn(cur.nodes, cur.edges);
  //     setGraph(res.nodes, res.edges, true);
  //     emitChange(res.nodes, res.edges);
  //   },
  //   [setGraph, emitChange],
  // );

  const applyToTargets = useCallback(
    (
      id: string,
      op: (
        ns: RfNode[],
        es: RfEdge[],
        tid: string,
      ) => { nodes: RfNode[]; edges: RfEdge[] },
    ) => {
      const cur = useMindMapStore.getState();
      const selectedIds = cur.nodes.filter((n) => n.selected).map((n) => n.id);
      const ids =
        selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
      let ns = cur.nodes;
      let es = cur.edges;
      for (const tid of ids) {
        const r = op(ns, es, tid);
        ns = r.nodes;
        es = r.edges;
      }
      setGraph(ns, es, true);
      emitChange(ns, es);
    },
    [setGraph, emitChange],
  );

  const applyMutationWithLayout = useCallback(
    (
      fn: (
        nodes: RfNode[],
        edges: RfEdge[],
      ) => { nodes: RfNode[]; edges: RfEdge[]; newId: string },
    ) => {
      const cur = useMindMapStore.getState();
      const res = fn(cur.nodes, cur.edges);
      if (!res.newId) return;
      const selected = applySelection(res.nodes, res.newId);
      mutate({ nodes: selected, edges: res.edges }, () => {
        setSelectedId(res.newId);
        setEditingId(res.newId);
      });
    },
    [mutate],
  );

  const addChildTo = useCallback(
    (id: string) => applyMutationWithLayout((ns, es) => addChild(ns, es, id)),
    [applyMutationWithLayout],
  );
  const addSiblingTo = useCallback(
    (id: string) => {
      applyMutationWithLayout((ns, es) => addSibling(ns, es, id));
    },
    [applyMutationWithLayout],
  );
  const addRootNode = useCallback(
    () => applyMutationWithLayout((ns, es) => addRoot(ns, es)),
    [applyMutationWithLayout],
  );
  // Resolve the actual delete-target set for a given focused id. When the
  // focused node is part of a multi-selection (size > 1) we operate on the
  // whole selection; otherwise it's just the focused id. Roots (depth=0)
  // are filtered out — `removeNode` returns unchanged for the last root,
  // and partial-root selections shouldn't drag the bulk operation down
  // with them.
  const getDeleteTargets = useCallback((focusedId: string): string[] => {
    const sel = selectedIdsRef.current;
    const ids =
      sel.has(focusedId) && sel.size > 1 ? Array.from(sel) : [focusedId];
    const cur = useMindMapStore.getState();
    const byId = new Map(cur.nodes.map((n) => [n.id, n]));
    return ids.filter((id) => {
      const n = byId.get(id);
      return n && n.data.depth !== 0;
    });
  }, []);
  const deleteNodeById = useCallback(
    (id: string) => {
      const targets = getDeleteTargets(id);
      if (targets.length === 0) return;
      const cur = useMindMapStore.getState();
      if (isLive) {
        const head = cur.nodes.find((n) => n.id === targets[0]);
        const headLabel = head?.data.label || "вузол";
        const label =
          targets.length > 1
            ? `${headLabel} +${targets.length - 1}`
            : headLabel;
        setDeleteConfirm({ ids: targets, label, keepChildren: false });
        return;
      }
      // Cascade-delete each target. removeNode is idempotent when the id
      // is already gone (its parent removed it earlier in the loop), so
      // overlapping selections in a parent-child chain just no-op.
      let ns = cur.nodes;
      let es = cur.edges;
      for (const tid of targets) {
        const r = removeNode(ns, es, tid);
        ns = r.nodes;
        es = r.edges;
      }
      if (ns === cur.nodes) return;
      mutate({ nodes: ns, edges: es }, () => setSelectedId(null));
    },
    [mutate, isLive, getDeleteTargets],
  );
  const setTextColorOf = useCallback(
    (id: string, c: string) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: setTextColor(ns, tid, c),
        edges: es,
      })),
    [applyToTargets],
  );
  const setLineColorOf = useCallback(
    (id: string, c: string) =>
      applyToTargets(id, (ns, es, tid) => setLineColor(ns, es, tid, c)),
    [applyToTargets],
  );
  const resetLineColorOf = useCallback(
    (id: string) =>
      applyToTargets(id, (ns, es, tid) => resetLineColor(ns, es, tid)),
    [applyToTargets],
  );
  const setBgColorOf = useCallback(
    (id: string, c: string) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: setBackgroundColor(ns, tid, c),
        edges: es,
      })),
    [applyToTargets],
  );
  const toggleBoldOf = useCallback(
    (id: string) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: toggleBold(ns, tid),
        edges: es,
      })),
    [applyToTargets],
  );
  const toggleItalicOf = useCallback(
    (id: string) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: toggleItalic(ns, tid),
        edges: es,
      })),
    [applyToTargets],
  );
  const setFontSizeOf = useCallback(
    (id: string, size: number) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: setFontSize(ns, tid, size),
        edges: es,
      })),
    [applyToTargets],
  );
  const setFontFamilyOf = useCallback(
    (id: string, ff: string) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: setFontFamily(ns, tid, ff),
        edges: es,
      })),
    [applyToTargets],
  );
  const setShapeOf = useCallback(
    (id: string, shape: ShapeType) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: setShape(ns, tid, shape),
        edges: es,
      })),
    [applyToTargets],
  );
  const setBorderStyleOf = useCallback(
    (id: string, bs: BorderStyle) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: setBorderStyle(ns, tid, bs),
        edges: es,
      })),
    [applyToTargets],
  );
  const setBranchTypeOf = useCallback(
    (id: string, bt: BranchType) =>
      applyToTargets(id, (ns, es, tid) => setBranchType(ns, es, tid, bt)),
    [applyToTargets],
  );
  const setFrameOf = useCallback(
    (id: string, f: FrameType) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: setFrame(ns, tid, f),
        edges: es,
      })),
    [applyToTargets],
  );
  const toggleTagOf = useCallback(
    (id: string, t: string) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: toggleTag(ns, tid, t),
        edges: es,
      })),
    [applyToTargets],
  );
  const toggleIconOf = useCallback(
    (id: string, ic: string) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: toggleIcon(ns, tid, ic),
        edges: es,
      })),
    [applyToTargets],
  );
  const setLinkOf = useCallback(
    (id: string, url: string) =>
      applyToTargets(id, (ns, es, tid) => ({
        nodes: setLink(ns, tid, url),
        edges: es,
      })),
    [applyToTargets],
  );
  const toggleExpandOf = useCallback(
    (id: string) => {
      // Collapse/expand applies to the specific node only, never multi-select
      const cur = useMindMapStore.getState();
      const ns = toggleExpand(cur.nodes, id);
      // Relayout visible nodes so expanded/collapsed subtrees don't overlap on Y axis
      const visible = filterCollapsed(ns, cur.edges);
      layoutElk(visible.nodes, visible.edges).then((laid) => {
        if (!mountedRef.current) return;
        const posMap = new Map(laid.nodes.map((n) => [n.id, n.position]));
        const merged = ns.map((n) => {
          const pos = posMap.get(n.id);
          return pos ? { ...n, position: pos } : n;
        });
        setGraph(merged, cur.edges, true);
        emitChange(merged, cur.edges);
      });
    },
    [setGraph, emitChange],
  );
  const expandToLevelOf = useCallback(
    (level: number, originId?: string | null) => {
      const cur = useMindMapStore.getState();
      // With a selection, scope expand/collapse to the SELECTED subtree
      // only — other branches of the map keep their current expand state.
      // `level` is relative to the origin's depth: 1 = direct children, 2
      // = grandchildren, etc.; 0 collapses the subtree to just origin.
      // Without a selection, fall back to the global expandToLevel which
      // applies the level uniformly across the entire map.
      const ns = originId
        ? expandSubtreeToLevel(cur.nodes, cur.edges, originId, level)
        : expandToLevel(cur.nodes, cur.edges, level);
      const visible = filterCollapsed(ns, cur.edges);
      layoutElk(visible.nodes, visible.edges).then((laid) => {
        if (!mountedRef.current) return;
        const posMap = new Map(laid.nodes.map((n) => [n.id, n.position]));
        const merged = ns.map((n) => {
          const pos = posMap.get(n.id);
          return pos ? { ...n, position: pos } : n;
        });
        setGraph(merged, cur.edges, true);
        emitChange(merged, cur.edges);
      });
    },
    [setGraph, emitChange],
  );

  const resetPositionOf = useCallback(
    (id: string) => {
      const cur = useMindMapStore.getState();
      // Reset all selected nodes if the target is among them
      const selectedIds = cur.nodes.filter((n) => n.selected).map((n) => n.id);
      const ids =
        selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
      let ns = cur.nodes;
      for (const nid of ids) ns = clearCustomPosition(ns, nid);
      mutate({ nodes: ns, edges: cur.edges });
    },
    [mutate],
  );

  // Bulk escape hatch: clear customLeft/customTop on EVERY node so the
  // entire map returns to pure auto-layout. Useful when repeated
  // expand/drag/collapse cycles leave a map visually drifted. Bound to
  // Ctrl+Alt+R (and exposed through the `actions` context so a toolbar
  // can invoke it later).
  const resetAllPositions = useCallback(() => {
    const cur = useMindMapStore.getState();
    let ns = cur.nodes;
    for (const n of cur.nodes) {
      const raw = n.data.raw.data as Record<string, unknown> | undefined;
      if (
        (raw && typeof raw.customLeft === "number") ||
        (raw && typeof raw.customTop === "number") ||
        (raw && typeof raw.offsetX === "number") ||
        (raw && typeof raw.offsetY === "number")
      ) {
        ns = clearCustomPosition(ns, n.id);
      }
    }
    mutate({ nodes: ns, edges: cur.edges });
  }, [mutate]);

  // Keyboard shortcut: Ctrl+Shift+0 (or Cmd+Shift+0) globally clears all
  // pinned positions. Ctrl+Alt+R was the previous binding but Cmd+Opt+R
  // is intercepted by the browser on macOS (Reload All Tabs). The `0`
  // key is rarely bound and works across OS. Uses capture phase so
  // nothing in between can `stopPropagation` it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && !e.altKey && e.key === "0") {
        if (!editable) return;
        e.preventDefault();
        e.stopPropagation();
        resetAllPositions();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [editable, resetAllPositions]);

  const commitResize = useCallback(() => {
    useMindMapStore.getState().commit();
    requestAnimationFrame(() => {
      const cur = useMindMapStore.getState();
      mutate({ nodes: cur.nodes, edges: cur.edges });
    });
  }, [mutate]);

  // ── Tier actions (stenographer) ──────────────────────────
  const setTierOnSubtree = useCallback(
    (nodeId: string, tier: string) => {
      const cur = useMindMapStore.getState();
      // Collect subtree: nodeId + all descendants via edges
      const descendants = new Set<string>([nodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of cur.edges) {
          if (descendants.has(e.source) && !descendants.has(e.target)) {
            descendants.add(e.target);
            changed = true;
          }
        }
      }
      const ns = cur.nodes.map((n) => {
        if (!descendants.has(n.id)) return n;
        const rawData = {
          ...((n.data.raw.data as Record<string, unknown>) ?? {}),
          tier,
        };
        return {
          ...n,
          data: { ...n.data, raw: { ...n.data.raw, data: rawData } },
        };
      });
      setGraph(ns, cur.edges, true);
      emitChange(ns, cur.edges);
    },
    [setGraph, emitChange],
  );

  const approveNode = useCallback(
    (nodeId: string) => setTierOnSubtree(nodeId, "etalon"),
    [setTierOnSubtree],
  );

  const rejectNode = useCallback(
    (nodeId: string) => {
      // Reject = explicit "I don't want this on my map" signal from the user.
      // Route through the same confirmation + backend-buffer path as a normal
      // delete so the LLM learns not to regenerate it on the next incremental.
      // In live sessions this shows the DeleteConfirmDialog; offline, it just
      // removes locally. `keepChildren=false` because reject removes the whole
      // subtree (rejecting "Cloud CLI" shouldn't leave its sub-points orphaned).
      const cur = useMindMapStore.getState();
      const node = cur.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (isLive) {
        setDeleteConfirm({
          ids: [nodeId],
          label: node.data.label || "вузол",
          keepChildren: false,
        });
        return;
      }
      const { nodes: ns, edges: es } = removeNode(cur.nodes, cur.edges, nodeId);
      if (ns === cur.nodes) return;
      setGraph(ns, es, true);
      emitChange(ns, es);
    },
    [isLive, setGraph, emitChange],
  );

  const approveAll = useCallback(() => {
    const cur = useMindMapStore.getState();
    const ns = cur.nodes.map((n) => {
      const rawData = {
        ...((n.data.raw.data as Record<string, unknown>) ?? {}),
        tier: "etalon",
      };
      return {
        ...n,
        data: { ...n.data, raw: { ...n.data.raw, data: rawData } },
      };
    });
    setGraph(ns, cur.edges, true);
    emitChange(ns, cur.edges);
  }, [setGraph, emitChange]);

  // ── Task actions ─────────────────────────────────────────
  /** Toggle task flag on a node. When enabled, label becomes taskText;
   * status defaults to "open". When disabled, all task fields are cleared. */
  const toggleTaskOf = useCallback(
    (nodeId: string) => {
      const cur = useMindMapStore.getState();
      const ns = cur.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const rawData = {
          ...((n.data.raw.data as Record<string, unknown>) ?? {}),
        };
        if (rawData.task === true) {
          delete rawData.task;
          delete rawData.taskStatus;
          delete rawData.taskId;
        } else {
          rawData.task = true;
          rawData.taskStatus = "open";
          // Stamp a stable identifier so the backend can bind the Task row
          // to this specific outline node across autosaves — without it each
          // save generates a new nodeId server-side and duplicates the row.
          if (!rawData.nodeId) {
            rawData.nodeId = `n${Math.random().toString(36).slice(2, 10)}`;
          }
        }
        return {
          ...n,
          data: { ...n.data, raw: { ...n.data.raw, data: rawData } },
        };
      });
      setGraph(ns, cur.edges, true);
      emitChange(ns, cur.edges);
    },
    [setGraph, emitChange],
  );

  /** Set or clear the task assignee in the outline. API call is fired by
   *  the picker itself (task-assignee.tsx) — here we only mirror the change
   *  into the store + outline so the node renders the new badge and the
   *  save-flow persists it. */
  const setTaskAssigneeOf = useCallback(
    (
      nodeId: string,
      user: { id: string; name: string; email?: string } | null,
    ) => {
      const cur = useMindMapStore.getState();
      const ns = cur.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const rawData = {
          ...((n.data.raw.data as Record<string, unknown>) ?? {}),
        };
        if (user) {
          rawData.ownerUserId = user.id;
          rawData.ownerName = user.name;
        } else {
          delete rawData.ownerUserId;
          delete rawData.ownerName;
        }
        return {
          ...n,
          data: { ...n.data, raw: { ...n.data.raw, data: rawData } },
        };
      });
      setGraph(ns, cur.edges, true);
      // Assignee badge changes the node's rendered width — give the DOM a
      // frame to re-measure, then ask ELK to reflow so siblings don't overlap.
      requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        const latest = useMindMapStore.getState();
        relayout(latest.nodes, latest.edges).then((laid) => {
          if (mountedRef.current) emitChange(laid.nodes, laid.edges);
        });
      });
    },
    [setGraph, emitChange, relayout],
  );

  /** Cycle taskStatus: open → done → cancelled → open. */
  const toggleTaskStatusOf = useCallback(
    (nodeId: string) => {
      const cur = useMindMapStore.getState();
      const ns = cur.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const rawData = {
          ...((n.data.raw.data as Record<string, unknown>) ?? {}),
        };
        if (rawData.task !== true) return n;
        const s = rawData.taskStatus;
        rawData.taskStatus =
          s === "open" ? "done" : s === "done" ? "cancelled" : "open";
        return {
          ...n,
          data: { ...n.data, raw: { ...n.data.raw, data: rawData } },
        };
      });
      setGraph(ns, cur.edges, true);
      emitChange(ns, cur.edges);
    },
    [setGraph, emitChange],
  );

  // ── Phase 1: MindNode-style operations ─────────────────────
  const addSiblingBeforeTo = useCallback(
    (id: string) =>
      applyMutationWithLayout((ns, es) => addSiblingBefore(ns, es, id)),
    [applyMutationWithLayout],
  );
  const deleteKeepChildrenOf = useCallback(
    (id: string) => {
      const targets = getDeleteTargets(id);
      if (targets.length === 0) return;
      const cur = useMindMapStore.getState();
      if (isLive) {
        const head = cur.nodes.find((n) => n.id === targets[0]);
        const headLabel = head?.data.label || "вузол";
        const label =
          targets.length > 1
            ? `${headLabel} +${targets.length - 1}`
            : headLabel;
        setDeleteConfirm({ ids: targets, label, keepChildren: true });
        return;
      }
      // Strip targets that are descendants of other targets. Without this
      // a parent + child multi-selection (Cmd+A, Shift-click chain, etc.)
      // would have the child removed deepest-first before the parent ever
      // gets the chance to lift it — defeating the whole point of "keep
      // children". Filter so only top-most selected nodes remain; each
      // gets its subtree lifted under its own grandparent.
      const targetSet = new Set(targets);
      const parentByEdge = new Map<string, string>();
      for (const e of cur.edges) parentByEdge.set(e.target, e.source);
      const topMostTargets = targets.filter((tid) => {
        let p = parentByEdge.get(tid);
        while (p !== undefined) {
          if (targetSet.has(p)) return false;
          p = parentByEdge.get(p);
        }
        return true;
      });
      // Process deepest-first so siblings that are themselves targets
      // don't shift each other's depth mid-loop. Each surviving target
      // owns a disjoint subtree, so order between them doesn't matter
      // for correctness — depth sort is just to keep the per-node
      // removeKeepChildren a no-op when the same id appears repeatedly.
      const byId = new Map(cur.nodes.map((n) => [n.id, n]));
      const ordered = [...topMostTargets].sort((a, b) => {
        const da = byId.get(a)?.data.depth ?? 0;
        const db = byId.get(b)?.data.depth ?? 0;
        return db - da;
      });
      let ns = cur.nodes;
      let es = cur.edges;
      for (const tid of ordered) {
        const r = removeKeepChildren(ns, es, tid);
        ns = r.nodes;
        es = r.edges;
      }
      if (ns === cur.nodes) return;
      mutate({ nodes: ns, edges: es }, () => setSelectedId(null));
    },
    [mutate, isLive, getDeleteTargets],
  );
  const confirmDeleteNode = useCallback(() => {
    if (!deleteConfirm) return;
    const cur = useMindMapStore.getState();
    const { ids, keepChildren } = deleteConfirm;

    // Push deleted labels to the backend buffer BEFORE mutating locally —
    // otherwise the next live transcript slice can race through the
    // OutlineBuilder with an empty buffer and re-add the node. Fire-and-
    // forget: if the API call fails the local delete still happens, the
    // user just loses AI protection against regeneration for these
    // labels. keepChildren=true → only the nodes themselves; keepChildren
    // =false → the whole subtree (every descendant would otherwise be
    // re-surfaced). For multi-select, every targeted id contributes.
    if (isLive && sessionId) {
      const labels: string[] = [];
      const nodeById = new Map(cur.nodes.map((n) => [n.id, n]));
      for (const id of ids) {
        const t = nodeById.get(id);
        if (t?.data.label) labels.push(t.data.label);
      }
      if (!keepChildren) {
        const childMap = new Map<string, string[]>();
        for (const e of cur.edges) {
          const arr = childMap.get(e.source) ?? [];
          arr.push(e.target);
          childMap.set(e.source, arr);
        }
        const seen = new Set<string>(ids);
        const stack = [...ids];
        while (stack.length) {
          const id = stack.pop()!;
          for (const c of childMap.get(id) ?? []) {
            if (seen.has(c)) continue;
            seen.add(c);
            stack.push(c);
            const cn = nodeById.get(c);
            if (cn?.data.label) labels.push(cn.data.label);
          }
        }
      }
      if (labels.length) {
        void apiFetch(`/mind-map/sessions/${sessionId}/deleted-signatures`, {
          method: "POST",
          body: JSON.stringify({ labels }),
        }).catch(() => undefined);
      }
    }

    let ns = cur.nodes;
    let es = cur.edges;
    if (keepChildren) {
      // Bottom-up so reparenting cascades correctly when an ancestor is
      // also in the selection (see deleteKeepChildrenOf for rationale).
      const byId = new Map(cur.nodes.map((n) => [n.id, n]));
      const ordered = [...ids].sort((a, b) => {
        const da = byId.get(a)?.data.depth ?? 0;
        const db = byId.get(b)?.data.depth ?? 0;
        return db - da;
      });
      for (const id of ordered) {
        const r = removeKeepChildren(ns, es, id);
        ns = r.nodes;
        es = r.edges;
      }
    } else {
      for (const id of ids) {
        const r = removeNode(ns, es, id);
        ns = r.nodes;
        es = r.edges;
      }
    }
    setDeleteConfirm(null);
    if (ns === cur.nodes) return;
    mutate({ nodes: ns, edges: es }, () => setSelectedId(null));
  }, [deleteConfirm, mutate, isLive, sessionId]);
  const cancelDeleteNode = useCallback(() => setDeleteConfirm(null), []);
  const insertParentOf = useCallback(
    (id: string) =>
      applyMutationWithLayout((ns, es) => insertParent(ns, es, id)),
    [applyMutationWithLayout],
  );
  const detachToRootOf = useCallback(
    (id: string) => {
      const cur = useMindMapStore.getState();
      const res = detachToRoot(cur.nodes, cur.edges, id);
      if (res.nodes === cur.nodes) return;
      mutate(res);
    },
    [mutate],
  );
  const reorderSiblingOf = useCallback(
    (id: string, dir: "up" | "down") => {
      const cur = useMindMapStore.getState();
      const res = reorderSibling(cur.nodes, cur.edges, id, dir);
      if (res.edges === cur.edges) return;
      mutate(res);
    },
    [mutate],
  );
  const indentNodeOf = useCallback(
    (id: string) => {
      const cur = useMindMapStore.getState();
      const res = indentNode(cur.nodes, cur.edges, id);
      if (res.nodes === cur.nodes) return;
      mutate(res);
    },
    [mutate],
  );
  const outdentNodeOf = useCallback(
    (id: string) => {
      const cur = useMindMapStore.getState();
      const res = outdentNode(cur.nodes, cur.edges, id);
      if (res.nodes === cur.nodes) return;
      mutate(res);
    },
    [mutate],
  );
  const toggleFocusMode = useCallback(() => {
    setFocusBranchId((cur) => {
      if (cur) return null; // toggle off
      const sel = selectedIdRef.current;
      if (!sel) return null;
      // Find the root of the selected node's branch
      const state = useMindMapStore.getState();
      const pMap = new Map<string, string>();
      for (const e of state.edges) pMap.set(e.target, e.source);
      let root = sel;
      while (pMap.has(root)) root = pMap.get(root)!;
      return root;
    });
  }, []);
  const copyStyleAction = useCallback(() => {
    const sel = selectedIdRef.current;
    if (!sel) return;
    const cur = useMindMapStore.getState();
    const node = cur.nodes.find((n) => n.id === sel);
    if (node) styleClipboardRef.current = extractStyle(node);
  }, []);
  const pasteStyleAction = useCallback(() => {
    const sel = selectedIdRef.current;
    const style = styleClipboardRef.current;
    if (!sel || !style) return;
    const cur = useMindMapStore.getState();
    const selectedIds = cur.nodes.filter((n) => n.selected).map((n) => n.id);
    const ids =
      selectedIds.includes(sel) && selectedIds.length > 1 ? selectedIds : [sel];
    let ns = cur.nodes;
    for (const id of ids) {
      ns = applyStyle(ns, id, style);
    }
    setGraph(ns, cur.edges, true);
    emitChange(ns, cur.edges);
  }, [setGraph, emitChange]);
  const selectAllChildren = useCallback(() => {
    const sel = selectedIdRef.current;
    if (!sel) return;
    const cur = useMindMapStore.getState();
    const childMap = new Map<string, string[]>();
    for (const e of cur.edges) {
      const arr = childMap.get(e.source) ?? [];
      arr.push(e.target);
      childMap.set(e.source, arr);
    }
    // Collect all descendants
    const toSelect = new Set<string>([sel]);
    const stack = [...(childMap.get(sel) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      toSelect.add(id);
      for (const c of childMap.get(id) ?? []) stack.push(c);
    }
    const ns = cur.nodes.map((n) => ({ ...n, selected: toSelect.has(n.id) }));
    setGraph(ns, cur.edges, false);
  }, [setGraph]);

  const actions: MindMapActions = useMemo(
    () => ({
      editable,
      editingId,
      selectedId,
      dropTarget,
      focusBranchId,
      beginEdit,
      commitEdit,
      cancelEdit,
      openMenuForNode,
      addChildTo,
      addSiblingTo,
      addSiblingBeforeTo,
      addRootNode,
      deleteNodeById,
      deleteKeepChildrenOf,
      insertParentOf,
      detachToRootOf,
      reorderSiblingOf,
      indentNodeOf,
      outdentNodeOf,
      setTextColorOf,
      setLineColorOf,
      resetLineColorOf,
      setBgColorOf,
      toggleBoldOf,
      toggleItalicOf,
      setFontSizeOf,
      setFontFamilyOf,
      setShapeOf,
      setBorderStyleOf,
      setBranchTypeOf,
      setFrameOf,
      toggleTagOf,
      toggleIconOf,
      setLinkOf,
      toggleExpandOf,
      toggleFocusMode,
      copyStyle: copyStyleAction,
      pasteStyle: pasteStyleAction,
      selectAllChildren,
      commitResize,
      getSelectedIds: () => {
        const live = selectedIdsRef.current;
        const sticky = multiSelectionRef.current;
        if (sticky.size <= live.size) return new Set(live);
        // Prune ghost IDs (deleted/undone nodes) from sticky on read.
        const valid = new Set(useMindMapStore.getState().nodes.map((n) => n.id));
        const pruned = new Set<string>();
        for (const sid of sticky) if (valid.has(sid)) pruned.add(sid);
        multiSelectionRef.current = pruned;
        return pruned;
      },
      resetPositionOf,
      relayoutAfterEdit,
      approveNode,
      rejectNode,
      approveAll,
      toggleTaskOf,
      toggleTaskStatusOf,
      setTaskAssigneeOf,
    }),
    [
      editable,
      // NOTE: `editingId`, `selectedId`, `dropTarget`, `focusBranchId` are
      // INTENTIONALLY not listed as dependencies. Those fields still exist
      // on the context value as a back-compat surface for any external
      // consumer, but the primary consumer (MindNode) now reads transient
      // state from `data.raw.data._*` (precomputed in the `nodes` useMemo).
      // Omitting them here keeps the context value reference stable, so
      // selection / drop-target churn does not re-render every memoized
      // node through useContext (which bypasses React.memo).
      beginEdit,
      commitEdit,
      cancelEdit,
      openMenuForNode,
      addChildTo,
      addSiblingTo,
      addSiblingBeforeTo,
      addRootNode,
      deleteNodeById,
      deleteKeepChildrenOf,
      insertParentOf,
      detachToRootOf,
      reorderSiblingOf,
      indentNodeOf,
      outdentNodeOf,
      setTextColorOf,
      setLineColorOf,
      resetLineColorOf,
      setBgColorOf,
      toggleBoldOf,
      toggleItalicOf,
      setFontSizeOf,
      setFontFamilyOf,
      setShapeOf,
      setBorderStyleOf,
      setBranchTypeOf,
      setFrameOf,
      toggleTagOf,
      toggleIconOf,
      toggleExpandOf,
      toggleFocusMode,
      copyStyleAction,
      pasteStyleAction,
      selectAllChildren,
      commitResize,
      resetPositionOf,
      relayoutAfterEdit,
      approveNode,
      rejectNode,
      approveAll,
      toggleTaskOf,
      toggleTaskStatusOf,
      setTaskAssigneeOf,
    ],
  );

  const onSelectionChange = useCallback((p: OnSelectionChangeParams) => {
    const ids = p.nodes.map((n) => n.id);
    // Don't let a transient empty-selection event blow away the multi
    // -select set during/right-after a drag. RF can briefly emit
    // onSelectionChange with [] between mousedown and the actual drag-
    // start dispatch — if we wrote that empty set into the ref, the
    // SECOND consecutive multi-drag would start with an empty selection
    // and degrade to single-node drag (the "first time OK, after that
    // no" pattern). Empty events from real deselect actions still clear
    // the focused id (singular) below; the ref is only protected.
    if (ids.length > 0 || !isDraggingRef.current) {
      selectedIdsRef.current = new Set(ids);
    }
    // Long-lived multi-selection snapshot — survives the spurious
    // single-id onSelectionChange RF emits on resize-handle pointerdown
    // (would otherwise shrink to 1 right before our onResizeStart fires).
    // Reset on full-clear; else UNION new ids into the set so
    // accumulating Shift+clicks keep building up.
    if (ids.length === 0) {
      multiSelectionRef.current = new Set();
    } else {
      for (const x of ids) multiSelectionRef.current.add(x);
    }
    // Selection ORDER for connectSelected (A→B): keep prior order for ids still
    // selected, append newly-added ids in RF's array order.
    if (ids.length === 0) {
      if (!isDraggingRef.current) selectionOrderRef.current = [];
    } else {
      const set = new Set(ids);
      const kept = selectionOrderRef.current.filter((x) => set.has(x));
      const keptSet = new Set(kept);
      for (const x of ids) if (!keptSet.has(x)) kept.push(x);
      selectionOrderRef.current = kept;
    }
    setSelectedId((cur) => {
      if (ids.length === 0) return null;
      if (cur && ids.includes(cur)) return cur;
      return ids[ids.length - 1];
    });
  }, []);
  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: { id: string }) => {
      // Exit edit mode on any node click (including the same node — double-click re-enters)
      if (editingIdRef.current && editingIdRef.current !== node.id) {
        editingIdRef.current = null;
        setEditingId(null);
      }
      setSelectedId(node.id);
    },
    [],
  );

  useEffect(() => {
    if (!editable) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const selectedId = selectedIdRef.current;

      const inField = isTypingTarget(e.target);

      // Cmd/Ctrl+A — let the browser handle "select all text" inside fields.
      if (
        mod &&
        !e.shiftKey &&
        !e.altKey &&
        e.code === "KeyA" &&
        !inField
      ) {
        e.preventDefault();
        rf.setNodes((ns) =>
          ns.every((n) => n.selected)
            ? ns
            : ns.map((n) => (n.selected ? n : { ...n, selected: true })),
        );
        return;
      }

      // Escape — cancel edit, then deselect.
      if (e.key === "Escape") {
        if (editingIdRef.current) {
          editingIdRef.current = null;
          setEditingId(null);
          return;
        }
        if (selectedId) setSelectedId(null);
        rf.setNodes((ns) =>
          ns.some((n) => n.selected)
            ? ns.map((n) => (n.selected ? { ...n, selected: false } : n))
            : ns,
        );
        return;
      }

      // Ctrl/Cmd+Z — store snapshot undo. Skip when focus is in a
      // text editor (toolbar title input, node contentEditable label):
      // those have native browser undo for char-level edits, and our
      // store snapshots are only meaningful at commit boundaries
      // (blur / Enter / drag-stop / etc.). Without this gate every
      // keystroke is a snapshot, so a single Ctrl+Z reverts one char
      // and obscures the actual rename.
      if (mod && e.code === "KeyZ" && !inField) {
        e.preventDefault();
        if (e.shiftKey) {
          if (redo()) {
            const s = useMindMapStore.getState();
            emitChange(s.nodes, s.edges);
          }
        } else {
          if (undo()) {
            const s = useMindMapStore.getState();
            emitChange(s.nodes, s.edges);
          }
        }
        return;
      }
      if (mod && e.code === "KeyY" && !inField) {
        e.preventDefault();
        if (redo()) {
          const s = useMindMapStore.getState();
          emitChange(s.nodes, s.edges);
        }
        return;
      }

      if (mod && e.code === "KeyB" && selectedId) {
        e.preventDefault();
        const cur = useMindMapStore.getState();
        const ns = toggleBold(cur.nodes, selectedId);
        setGraph(ns, cur.edges, true);
        emitChange(ns, cur.edges);
        return;
      }
      if (mod && e.code === "KeyI" && selectedId) {
        e.preventDefault();
        const cur = useMindMapStore.getState();
        const ns = toggleItalic(cur.nodes, selectedId);
        setGraph(ns, cur.edges, true);
        emitChange(ns, cur.edges);
        return;
      }

      // Alt+Cmd+C — Copy style. Skip while typing — let the browser
      // handle native text copy in contentEditable/inputs.
      if (
        mod &&
        e.altKey &&
        e.code === "KeyC" &&
        selectedId &&
        !inField
      ) {
        e.preventDefault();
        copyStyleAction();
        return;
      }
      // Alt+Cmd+V — Paste style
      if (
        mod &&
        e.altKey &&
        e.code === "KeyV" &&
        selectedId &&
        !inField
      ) {
        e.preventDefault();
        pasteStyleAction();
        return;
      }

      // Cmd+C — Copy subtree (skip while typing in a node/input)
      if (
        mod &&
        e.code === "KeyC" &&
        selectedId &&
        !inField
      ) {
        e.preventDefault();
        const cur = useMindMapStore.getState();
        const subtree = serializeSubtree(cur.nodes, cur.edges, selectedId);
        if (subtree) {
          navigator.clipboard
            .writeText(JSON.stringify({ __mindmap: true, subtree }))
            .catch(() => {});
        }
        return;
      }
      // Cmd+V — Paste subtree
      if (
        mod &&
        e.code === "KeyV" &&
        selectedId &&
        !inField
      ) {
        e.preventDefault();
        navigator.clipboard
          .readText()
          .then((text) => {
            try {
              const parsed = JSON.parse(text);
              if (!parsed?.__mindmap || !parsed.subtree) return;
              const cur = useMindMapStore.getState();
              const res = insertSubtree(
                cur.nodes,
                cur.edges,
                selectedId,
                parsed.subtree,
              );
              mutate(res);
            } catch {}
          })
          .catch(() => {});
        return;
      }

      // Alt+Cmd+A — Select all children
      if (mod && e.altKey && e.code === "KeyA" && selectedId) {
        e.preventDefault();
        selectAllChildren();
        return;
      }

      // Shift+Cmd+D — Detach to root
      if (mod && e.shiftKey && e.code === "KeyD" && selectedId) {
        e.preventDefault();
        detachToRootOf(selectedId);
        return;
      }

      // Shift+Cmd+T — Toggle Task on the selected node (MindNode-style)
      if (mod && e.shiftKey && e.code === "KeyT" && selectedId) {
        e.preventDefault();
        toggleTaskOf(selectedId);
        return;
      }
      // Ctrl+Cmd+T — toggle task status (open ↔ done)
      if (mod && e.ctrlKey && e.code === "KeyT" && selectedId) {
        e.preventDefault();
        toggleTaskStatusOf(selectedId);
        return;
      }

      // Ctrl+Cmd+R — Reset position to auto-layout. Triggered for either
      // legacy absolute pin (customLeft/Top) or the live offset model.
      if (mod && e.ctrlKey && e.code === "KeyR" && selectedId) {
        e.preventDefault();
        const cur = useMindMapStore.getState();
        const node = cur.nodes.find((n) => n.id === selectedId);
        const raw = node?.data.raw.data ?? {};
        const isPinned =
          typeof raw.customLeft === "number" ||
          (typeof raw.offsetX === "number" && raw.offsetX !== 0) ||
          (typeof raw.offsetY === "number" && raw.offsetY !== 0);
        if (isPinned) {
          const ns = clearCustomPosition(cur.nodes, selectedId);
          mutate({ nodes: ns, edges: cur.edges });
        }
        return;
      }

      if (editingIdRef.current) return;
      if (isTypingTarget(e.target)) return;

      // ` / ~ — collapse all (level 0, only root). If a node is selected,
      // collapse the subtree rooted at that node instead.
      if (
        !mod &&
        !e.altKey &&
        (e.key === "`" || e.key === "~" || e.code === "Backquote")
      ) {
        e.preventDefault();
        expandToLevelOf(0, selectedId ?? null);
        return;
      }
      // 0-9 — expand to that depth level. With a selection, depth is measured
      // relative to the selected node and only its subtree is touched.
      if (!mod && !e.altKey && !e.shiftKey) {
        const digit = parseInt(e.key, 10);
        if (digit >= 0 && digit <= 9) {
          e.preventDefault();
          expandToLevelOf(digit, selectedId ?? null);
          return;
        }
      }

      if (!selectedId) return;

      const cur = useMindMapStore.getState();

      // Cmd+Arrow — reorder/indent/outdent
      if (mod && e.key === "ArrowUp") {
        e.preventDefault();
        reorderSiblingOf(selectedId, "up");
        return;
      }
      if (mod && e.key === "ArrowDown") {
        e.preventDefault();
        reorderSiblingOf(selectedId, "down");
        return;
      }
      if (mod && e.key === "ArrowRight") {
        e.preventDefault();
        indentNodeOf(selectedId);
        return;
      }
      if (mod && e.key === "ArrowLeft") {
        e.preventDefault();
        outdentNodeOf(selectedId);
        return;
      }

      // Alt+Tab — Insert parent
      if (e.altKey && e.key === "Tab") {
        e.preventDefault();
        const res = insertParent(cur.nodes, cur.edges, selectedId);
        if (!res.newId) return;
        const selected = applySelection(res.nodes, res.newId);
        mutate({ nodes: selected, edges: res.edges }, () => {
          setSelectedId(res.newId);
          setEditingId(res.newId);
        });
        return;
      }

      // Tab — Add child
      if (e.key === "Tab") {
        e.preventDefault();
        const res = addChild(cur.nodes, cur.edges, selectedId);
        if (!res.newId) return;
        const selected = applySelection(res.nodes, res.newId);
        mutate({ nodes: selected, edges: res.edges }, () => {
          setSelectedId(res.newId);
          setEditingId(res.newId);
        });
        return;
      }

      // Shift+Enter — New root node
      if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        const res = addRoot(cur.nodes, cur.edges);
        if (!res.newId) return;
        const selected = applySelection(res.nodes, res.newId);
        mutate({ nodes: selected, edges: res.edges }, () => {
          setSelectedId(res.newId);
          setEditingId(res.newId);
        });
        return;
      }

      // Alt+Enter — Sibling above
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        const res = addSiblingBefore(cur.nodes, cur.edges, selectedId);
        if (!res.newId) return;
        const selected = applySelection(res.nodes, res.newId);
        mutate({ nodes: selected, edges: res.edges }, () => {
          setSelectedId(res.newId);
          setEditingId(res.newId);
        });
        return;
      }

      // Enter — Add sibling (or child if root)
      if (e.key === "Enter") {
        e.preventDefault();
        const target = cur.nodes.find((n) => n.id === selectedId);
        const isRoot = target?.data.depth === 0;
        const res = isRoot
          ? addChild(cur.nodes, cur.edges, selectedId)
          : addSibling(cur.nodes, cur.edges, selectedId);
        if (!res.newId) return;
        const selected = applySelection(res.nodes, res.newId);
        mutate({ nodes: selected, edges: res.edges }, () => {
          setSelectedId(res.newId);
          setEditingId(res.newId);
        });
        return;
      }

      // Delete / Backspace — remove the focused node but **lift its
      // children** one level so the user's nested work isn't lost. This
      // matches MindNode's default and the user's mental model: «delete
      // the node, children take its place». The cascade-delete-the-whole-
      // subtree variant is now Shift+Delete (and the red "Delete with
      // subtree" item in the node popover) — rare op, opt-in only.
      // Multi-select aware: operates on the whole selection when it
      // contains the focused id and has size > 1.
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !e.shiftKey
      ) {
        if (getDeleteTargets(selectedId).length === 0) return;
        e.preventDefault();
        deleteKeepChildrenOf(selectedId);
        return;
      }

      // Shift+Delete / Shift+Backspace — destructive cascade variant.
      // Removes the node together with its entire subtree. Required when
      // the user really wants to drop a chunk of the map (rare); the
      // shifted modifier prevents accidental wipes.
      if (
        e.shiftKey &&
        (e.key === "Delete" || e.key === "Backspace")
      ) {
        if (getDeleteTargets(selectedId).length === 0) return;
        e.preventDefault();
        deleteNodeById(selectedId);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        setEditingId(selectedId);
        return;
      }

      // ? — open the keyboard-shortcut overview modal. Skip when typing
      // in an input / contentEditable so users can still type ? in node
      // labels. Shift+/ produces "?" on most layouts; we just match the
      // resolved key.
      if (e.key === "?" && !inField) {
        e.preventDefault();
        setHotkeysHelpOpen((v) => !v);
        return;
      }

      // Alt+. — Toggle fold (MindNode style)
      if (e.altKey && e.key === ".") {
        e.preventDefault();
        toggleExpandOf(selectedId);
        return;
      }

      // / — Toggle fold (legacy)
      if (e.key === "/") {
        e.preventDefault();
        toggleExpandOf(selectedId);
        return;
      }

      // Arrow navigation
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();
        const dir =
          e.key === "ArrowUp"
            ? "up"
            : e.key === "ArrowDown"
              ? "down"
              : e.key === "ArrowLeft"
                ? "left"
                : "right";
        const next = navigate(cur.nodes, cur.edges, selectedId, dir);
        if (next) setSelectedId(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    editable,
    undo,
    redo,
    emitChange,
    mutate,
    setGraph,
    copyStyleAction,
    pasteStyleAction,
    selectAllChildren,
    detachToRootOf,
    toggleFocusMode,
    reorderSiblingOf,
    indentNodeOf,
    outdentNodeOf,
    deleteKeepChildrenOf,
    deleteNodeById,
    toggleExpandOf,
    expandToLevelOf,
    getDeleteTargets,
    toggleTaskOf,
    toggleTaskStatusOf,
  ]);

  // Viewer-safe shortcuts — run only when the map is NOT editable.
  // Covers read-only navigation and fold controls: ` / 0–9 (expand-to-depth),
  // / and Alt+. (toggle fold), arrow keys (navigation), Shift+Cmd+F (focus).
  useEffect(() => {
    if (editable) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const selectedId = selectedIdRef.current;

      if (isTypingTarget(e.target)) return;

      // ` / ~ — collapse all to root (or just the selected subtree)
      if (
        !mod &&
        !e.altKey &&
        (e.key === "`" || e.key === "~" || e.code === "Backquote")
      ) {
        e.preventDefault();
        expandToLevelOf(0, selectedId ?? null);
        return;
      }
      // 0-9 — expand to depth level (relative to selection if any)
      if (!mod && !e.altKey && !e.shiftKey) {
        const digit = parseInt(e.key, 10);
        if (digit >= 0 && digit <= 9) {
          e.preventDefault();
          expandToLevelOf(digit, selectedId ?? null);
          return;
        }
      }

      if (!selectedId) return;

      // / — toggle fold
      if (!mod && !e.altKey && e.key === "/") {
        e.preventDefault();
        toggleExpandOf(selectedId);
        return;
      }
      // Alt+. — toggle fold (MindNode style)
      if (e.altKey && e.key === ".") {
        e.preventDefault();
        toggleExpandOf(selectedId);
        return;
      }

      // Arrow navigation
      if (
        !mod &&
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight")
      ) {
        e.preventDefault();
        const dir =
          e.key === "ArrowUp"
            ? "up"
            : e.key === "ArrowDown"
              ? "down"
              : e.key === "ArrowLeft"
                ? "left"
                : "right";
        const cur = useMindMapStore.getState();
        const next = navigate(cur.nodes, cur.edges, selectedId, dir);
        if (next) setSelectedId(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editable, expandToLevelOf, toggleExpandOf, toggleFocusMode]);

  const onNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: RfNode) => {
      if (!editable) return;
      // Kill all CSS transitions while dragging — a single class toggle is
      // cheaper than letting the browser interpolate transform/d for
      // hundreds of nodes every frame.
      wrapperRef.current?.classList.add("mind-dragging");
      // Suppress RF → Zustand position sync for the duration of the drag.
      // See onNodesChange for rationale.
      isDraggingRef.current = true;
      if (node.data.depth === 0) {
        const cur = useMindMapStore.getState();
        const { children } = buildMaps(cur.nodes, cur.edges);
        // O(1) node lookup — cur.nodes.find() made drag-start O(n²).
        const nodeById = new Map(cur.nodes.map((n) => [n.id, n]));
        const descendants = new Map<string, { x: number; y: number }>();
        const stack = [...(children.get(node.id) ?? [])];
        while (stack.length) {
          const id = stack.pop()!;
          const n = nodeById.get(id);
          if (n) descendants.set(id, { x: n.position.x, y: n.position.y });
          // Don't descend into collapsed branches — their nodes never went
          // through layoutElk (filterCollapsed strips them before layout),
          // so n.position is stale (0,0). Pinning them on drag-stop would
          // anchor them at the canvas origin, then any later expand surfaces
          // a pile of overlapping nodes in the left column.
          const raw = (n?.data.raw.data ?? {}) as Record<string, unknown>;
          if (raw.expand === false) continue;
          for (const c of children.get(id) ?? []) stack.push(c);
        }
        rootDragRef.current = {
          startX: node.position.x,
          startY: node.position.y,
          descendants,
        };
        nonRootDragRef.current = null;
      } else {
        // Track descendants so they move with parent during drag
        const cur = useMindMapStore.getState();
        const { children } = buildMaps(cur.nodes, cur.edges);
        const nodeById = new Map(cur.nodes.map((n) => [n.id, n]));
        const descendants = new Map<string, { x: number; y: number }>();
        const stack = [...(children.get(node.id) ?? [])];
        while (stack.length) {
          const id = stack.pop()!;
          const n = nodeById.get(id);
          if (n) descendants.set(id, { x: n.position.x, y: n.position.y });
          const raw = (n?.data.raw.data ?? {}) as Record<string, unknown>;
          if (raw.expand === false) continue;
          for (const c of children.get(id) ?? []) stack.push(c);
        }

        // Snapshot pre-drag positions of every node in the rigid drag
        // group. The group covers:
        //   • every multi-selected non-root node (read from
        //     selectedIdsRef — authoritative because it reflects RF's
        //     onSelectionChange directly, sidestepping store-vs-RF
        //     selection state drift after layout/setGraph round-trips),
        //   • plus the dragged node itself,
        //   • plus the FULL subtree of every selected node (so multi-
        //     selecting a parent still drags its children even if the
        //     children themselves aren't selected).
        // Used both by `onNodeDrag` (apply delta to whole group each
        // tick) and `onNodeDragStop` (per-node setOffset for selected
        // ids; descendants follow via the offset cascade in layout-elk).
        const selectedHomes = new Map<string, { x: number; y: number }>();
        const selSet = new Set<string>(selectedIdsRef.current);
        // Defensive fallback. RF can clear or skip dispatching a
        // selection change for the multi-select set when the user
        // mouse-downs on the focused node to start a drag — onSelection
        // Change never re-fires, so selectedIdsRef stays stale or holds
        // only the dragged node. Read `n.selected` off the store as a
        // belt-and-braces backup; whichever path actually carries the
        // multi-selection state at drag-start gets folded into selSet.
        for (const n of cur.nodes) {
          if (n.selected && n.data.depth !== 0) selSet.add(n.id);
        }
        selSet.add(node.id);
        const selectedTopIds: string[] = [];
        for (const sid of selSet) {
          const sn = nodeById.get(sid);
          if (!sn || sn.data.depth === 0) continue;
          selectedHomes.set(sid, { x: sn.position.x, y: sn.position.y });
          selectedTopIds.push(sid);
          // Walk descendants of every selected node.
          const stackS = [...(children.get(sid) ?? [])];
          while (stackS.length) {
            const id = stackS.pop()!;
            if (selectedHomes.has(id)) continue;
            const dn = nodeById.get(id);
            if (!dn) continue;
            selectedHomes.set(id, { x: dn.position.x, y: dn.position.y });
            for (const c of children.get(id) ?? []) stackS.push(c);
          }
        }
        // Remember the current parent so drag-stop can ignore drops that
        // would reparent to the same node (MindNode treats that as snap-back).
        const parentEdge = cur.edges.find((e) => e.target === node.id);
        // Snapshot home positions of every sibling in the dragged node's
        // parent group — used by the live-reorder preview to reposition
        // them into their slot order each tick while the cursor moves.
        // Also snapshot each sibling's FULL subtree so live-preview can
        // shift their descendants by the same delta (otherwise the
        // descendants stay at stale home-Y and overlap neighbouring rows).
        const siblingHomes = new Map<
          string,
          { x: number; y: number; autoY: number; h: number }
        >();
        const siblingSubtreeHomes = new Map<
          string,
          Map<string, { x: number; y: number }>
        >();
        // Helper to read a node's current personal-touch Y offset.
        // Each sibling tracks two positions: its phantom slot (auto Y =
        // displayed Y minus own offsetY) and its real displayed Y.
        // Reorder math operates on slot Y so personal touches survive.
        const ownOffsetYOf = (n: RfNode): number => {
          const raw =
            (n.data?.raw?.data as Record<string, unknown> | undefined) ?? {};
          const off = raw.offsetY;
          return typeof off === "number" ? off : 0;
        };
        if (parentEdge?.source) {
          for (const e of cur.edges) {
            if (e.source !== parentEdge.source) continue;
            if (e.target === node.id) continue;
            const s = nodeById.get(e.target);
            if (!s) continue;
            const sibOff = ownOffsetYOf(s);
            siblingHomes.set(e.target, {
              x: s.position.x,
              y: s.position.y,
              autoY: s.position.y - sibOff,
              h: s.measured?.height ?? 40,
            });
            // BFS descendants of this sibling.
            const descHomes = new Map<string, { x: number; y: number }>();
            const stackD = [...(children.get(e.target) ?? [])];
            while (stackD.length) {
              const did = stackD.pop()!;
              const dn = nodeById.get(did);
              if (dn)
                descHomes.set(did, { x: dn.position.x, y: dn.position.y });
              for (const c of children.get(did) ?? []) stackD.push(c);
            }
            siblingSubtreeHomes.set(e.target, descHomes);
          }
        }
        const draggedOwnOffY = ownOffsetYOf(node);
        const draggedOwnOffX = (() => {
          const raw =
            (node.data?.raw?.data as Record<string, unknown> | undefined) ?? {};
          const off = raw.offsetX;
          return typeof off === "number" ? off : 0;
        })();
        nonRootDragRef.current = {
          nodeId: node.id,
          homePos: { x: node.position.x, y: node.position.y },
          // Auto slot Y/X at drag-start: displayed minus own offset.
          // For an unpinned node this equals homePos.
          homeAutoY: node.position.y - draggedOwnOffY,
          homeAutoX: node.position.x - draggedOwnOffX,
          descendants,
          selectedHomes,
          selectedTopIds,
          parentId: parentEdge?.source,
          siblingHomes,
          siblingSubtreeHomes,
          draggedHeight: node.measured?.height ?? 40,
        };
        rootDragRef.current = null;
      }
      // Reset dwell state at the start of every drag — no stale candidate
      // should carry over between drags.
      dwellRef.current = null;
    },
    [editable],
  );

  // Global Option/Alt tracker. While held, drag magnetism is disabled —
  // the node pins wherever it is dropped, no reparent candidate is
  // proposed.
  //
  // Window-blur cleanup: when the user Alt+Tabs away (or otherwise loses
  // focus), the matching keyup / mouseup events fire on the OTHER window
  // and never reach our listeners. Without an explicit reset:
  //   • altDownRef stays `true` because Alt-keyup never arrived → the
  //     next mousemove takes onNodeDrag's "Alt-held" early-return branch
  //     (magnetism off, no phantom slot, no dwell, drop targets cleared)
  //     even though the user isn't actually holding Alt.
  //   • If a drag was in flight, mouseup never reached us either, so
  //     isDraggingRef / nonRootDragRef / pending rAFs / the dragging CSS
  //     class stay stuck, corrupting the next interaction.
  // Resetting all of this on blur makes the next user action start
  // from a clean slate.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") altDownRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") altDownRef.current = false;
    };
    const blur = () => {
      altDownRef.current = false;
      isDraggingRef.current = false;
      if (dragRafRef.current != null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      if (liveReorderRafRef.current != null) {
        cancelAnimationFrame(liveReorderRafRef.current);
        liveReorderRafRef.current = null;
      }
      pendingDragPayloadRef.current = null;
      pendingLiveReorderRef.current = null;
      dragTickPendingRef.current = false;
      nonRootDragRef.current = null;
      rootDragRef.current = null;
      dwellRef.current = null;
      // Without these the dashed-border drag placeholder + drop-target
      // outline + Yjs drag-snapshot stay rendered after the user Alt-Tabs
      // away mid-drag, producing a phantom box stuck on the canvas until
      // the page is reloaded. Match the cleanup in onNodeDragStop.
      setDragGhost(null);
      setDropTarget(null);
      wrapperRef.current?.classList.remove("mind-dragging");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, dragNode: RfNode) => {
      if (!editable) return;
      // Coarse rAF throttle: one full `onNodeDrag` body per animation
      // frame. High-DPI mice fire mousemove > 60 Hz; without this, the
      // drop-target O(n) scans below run every event and drag visibly
      // lags on 300+ node maps. RF keeps the dragged node visually in
      // sync through its own internal state — skipping our callback on
      // intermediate ticks does NOT freeze the cursor follow.
      if (dragTickPendingRef.current) return;
      dragTickPendingRef.current = true;
      requestAnimationFrame(() => {
        dragTickPendingRef.current = false;
      });
      let node = dragNode;
      const info = rootDragRef.current;
      if (info && node.data.depth === 0) {
        const dx = node.position.x - info.startX;
        const dy = node.position.y - info.startY;
        if (dx === 0 && dy === 0) return;
        // Same rAF throttle as the non-root path below.
        pendingDragPayloadRef.current = { dx, dy, nodeId: node.id };
        if (dragRafRef.current == null) {
          dragRafRef.current = requestAnimationFrame(() => {
            dragRafRef.current = null;
            const payload = pendingDragPayloadRef.current;
            pendingDragPayloadRef.current = null;
            if (!payload) return;
            const latest = useMindMapStore.getState();
            const ri = rootDragRef.current;
            if (!ri) return;
            const moved = latest.nodes.map((n) => {
              const start = ri.descendants.get(n.id);
              if (!start) return n;
              return {
                ...n,
                position: { x: start.x + payload.dx, y: start.y + payload.dy },
              };
            });
            setGraph(moved, latest.edges, false);
          });
        }
        return;
      }
      if (node.data.depth === 0) return;
      const cur = useMindMapStore.getState();
      const nrInfo = nonRootDragRef.current;

      // MindNode-style rigid group drag: every snapshot-selected node AND
      // every descendant of the primary dragged node moves by the same delta
      // each mouse-move tick. Result: the entire selection + subtree follows
      // the cursor as one piece. On drop, each of them will already sit at
      // its final position, so `setCustomPosition(nid, n.position, ...)` in
      // drag-stop simply pins them where they visually are.
      const rigidGroupActive =
        nrInfo &&
        nrInfo.nodeId === node.id &&
        ((nrInfo.descendants?.size ?? 0) > 0 ||
          (nrInfo.selectedHomes?.size ?? 0) > 1);
      // Rigid-group rAF always runs — even when the drag is in the
      // sibling column — otherwise the dragged node's descendants stay
      // at their HOME positions while the primary flies with the cursor,
      // producing visible overlap with other sibling rows. The
      // live-reorder preview uses a separate rAF ref (liveReorderRafRef)
      // and targets only sibling nodes, so the two don't conflict —
      // they touch disjoint sets of nodes.
      if (rigidGroupActive && nrInfo) {
        const dx = node.position.x - nrInfo.homePos.x;
        const dy = node.position.y - nrInfo.homePos.y;
        // Skip no-op ticks (cursor hasn't moved between mouse events).
        if (dx !== 0 || dy !== 0) {
          // Coalesce rigid-group updates to one per animation frame. Browser
          // mousemove can fire faster than 60 Hz on high-DPI mice; each tick
          // spreads all N nodes into a new array and kicks a full RF diff.
          // rAF collapses bursts into a single per-frame update.
          pendingDragPayloadRef.current = { dx, dy, nodeId: node.id };
          if (dragRafRef.current == null) {
            dragRafRef.current = requestAnimationFrame(() => {
              dragRafRef.current = null;
              const payload = pendingDragPayloadRef.current;
              pendingDragPayloadRef.current = null;
              if (!payload) return;
              const info = nonRootDragRef.current;
              if (!info || info.nodeId !== payload.nodeId) return;
              const latest = useMindMapStore.getState();
              const descendants = info.descendants;
              const selectedHomes = info.selectedHomes;
              // RF v12 natively handles multi-drag of a selection: when a
              // drag starts on a node, `getDragItems` (in @xyflow/system,
              // index.mjs:1978) collects the dragged node PLUS every node
              // with `selected === true` into the drag set, and applies
              // the same delta to all of them through its internal
              // NodeChange[type='position'] dispatch. Trying to also move
              // those nodes from this rAF (via setGraph or rf.updateNode)
              // racing against RF's own drag pipeline is what made the
              // visual freeze on multi-drag — our writes either lost to
              // RF's writes or arrived in a frame that RF's "drag-active
              // re-render gate" was actively suppressing.
              //
              // So this rAF intentionally only moves what RF DOESN'T
              // handle: non-selected DESCENDANTS of the dragged node /
              // selected nodes (subtree-follow). Selected ids themselves
              // are skipped — RF moves them.
              const selectedTopSet = new Set<string>(info.selectedTopIds ?? []);
              const moved = latest.nodes.map((n) => {
                if (n.id === payload.nodeId) return n;
                // Skip explicitly-selected nodes — RF's native multi-
                // drag is already moving them.
                if (selectedTopSet.has(n.id)) return n;
                // Descendants of the primary dragged node need to follow
                // — RF doesn't include unselected descendants in its
                // drag set.
                const descStart = descendants?.get(n.id);
                if (descStart) {
                  return {
                    ...n,
                    position: {
                      x: descStart.x + payload.dx,
                      y: descStart.y + payload.dy,
                    },
                  };
                }
                // Descendants of any other selected node: snapshotted
                // into selectedHomes at drag-start. Move them too;
                // selected parents themselves were filtered out above.
                const selHome = selectedHomes?.get(n.id);
                if (selHome) {
                  return {
                    ...n,
                    position: {
                      x: selHome.x + payload.dx,
                      y: selHome.y + payload.dy,
                    },
                  };
                }
                return n;
              });
              setGraph(moved, latest.edges, false);
            });
          }
        }
      }

      // Subtree Set — rebuilt each tick was O(n) BFS over every edge on
      // every mouse-move, the biggest cost on large maps. drag-start
      // already walked descendants into `nrInfo.descendants`, so reuse it.
      // Fallback path (no nrInfo) still does the walk.
      let subtree: Set<string>;
      if (nrInfo && nrInfo.nodeId === node.id && nrInfo.descendants) {
        subtree = new Set<string>(nrInfo.descendants.keys());
        subtree.add(node.id);
      } else {
        subtree = new Set<string>();
        const map = new Map<string, string[]>();
        for (const e of cur.edges) {
          const arr = map.get(e.source) ?? [];
          arr.push(e.target);
          map.set(e.source, arr);
        }
        const stack = [node.id];
        while (stack.length) {
          const id = stack.pop()!;
          subtree.add(id);
          for (const c of map.get(id) ?? []) stack.push(c);
        }
      }
      const w = node.measured?.width ?? 120;
      const h = node.measured?.height ?? 40;
      const cx = node.position.x + w / 2;
      const cy = node.position.y + h / 2;

      // Current parent of the dragged node — never propose it as a drop
      // target: dropping on your own parent is a no-op reparent and
      // MindNode treats that as snap-back, not "attach".
      const curParentId = nrInfo?.parentId;

      // Ghost is managed by the Phase-0 block (shown on phantom slot
      // when cursor is within snap-radius). Fallback outside of Phase 0
      // (e.g. Alt-held "disable magnetism") is a no-op — no ghost.
      const maybeShowGhost = () => {
        setDragGhost(null);
      };

      // Option/Alt is held → disable magnetism entirely. Node will pin at
      // drop position, no reparent candidate considered.
      const altHeld = _event.altKey === true || altDownRef.current;
      if (altHeld) {
        if (dwellRef.current) dwellRef.current = null;
        if (dropTarget) setDropTarget(null);
        maybeShowGhost();
        return;
      }

      // Phase 1 — child-drop has HIGHEST priority (MindNode §10 flow-chart:
      // "Drop on another node (center hit) → Reparent"). When the cursor
      // sits inside the central 50 % of any non-subtree node's bbox, we
      // commit to reparent even if the drag is technically still in the
      // sibling column — it's what the user actually wants.
      let siblingCandidate: { id: string; mode: "before" | "after" } | null =
        null;
      let childCandidate: string | null = null;
      for (const n of cur.nodes) {
        if (subtree.has(n.id) || n.selected) continue;
        if (n.id === curParentId) continue;
        const nw = n.measured?.width ?? 120;
        const nh = n.measured?.height ?? 40;
        const marginX = (nw * (1 - CHILD_ZONE_FRACTION)) / 2;
        const marginY = (nh * (1 - CHILD_ZONE_FRACTION)) / 2;
        const x1 = n.position.x + marginX;
        const x2 = n.position.x + nw - marginX;
        const y1 = n.position.y + marginY;
        const y2 = n.position.y + nh - marginY;
        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
          childCandidate = n.id;
          break;
        }
      }

      // If user is about to reparent (child-drop), cancel any in-flight
      // sibling live-preview and restore siblings to their HOME positions
      // — otherwise the nodes we shifted out of the way stay displaced
      // visually even after the cursor moved onto a drop-target node.
      if (childCandidate && nrInfo?.siblingHomes) {
        const homes = nrInfo.siblingHomes;
        const restoreTargets = new Map<string, { x: number; y: number }>();
        for (const [sid, hm] of homes)
          restoreTargets.set(sid, { x: hm.x, y: hm.y });
        pendingLiveReorderRef.current = restoreTargets;
        if (liveReorderRafRef.current == null) {
          liveReorderRafRef.current = requestAnimationFrame(() => {
            liveReorderRafRef.current = null;
            const tgt = pendingLiveReorderRef.current;
            pendingLiveReorderRef.current = null;
            if (!tgt) return;
            const latest = useMindMapStore.getState();
            const moved = latest.nodes.map((n) => {
              const target = tgt.get(n.id);
              if (!target) return n;
              if (n.position.x === target.x && n.position.y === target.y)
                return n;
              return { ...n, position: target };
            });
            setGraph(moved, latest.edges, false);
          });
        }
      }

      // Phase 0 — "sibling column reorder" (MindNode §8). Only runs when
      // NO child-drop candidate was found — i.e. the cursor is in the
      // column but not on any node's centre. Inter-node gaps + thin
      // sliver around node edges count as sibling reorder.
      const homeX = nrInfo?.homePos.x;
      const draggedW = node.measured?.width ?? w;
      // 1.5 × draggedW matches the asymmetric magnet zone (PHANTOM_X_ZONE
      // below). Earlier this was 1.0 × draggedW which created a gap
      // between live-shift zone and magnet zone — siblings would shift
      // while the cursor was outside the magnet zone, leaving the user
      // with shifted siblings but no ghost indicator.
      const inSiblingColumn =
        typeof homeX === "number" &&
        Math.abs(node.position.x - homeX) < draggedW * 1.5;

      // Distance-based gate — any drag past the snap threshold triggers
      // live column repacking, regardless of which X half the cursor is
      // in. This matches MindNode's behaviour: the moment a node is
      // displaced enough to be "pinned", its slot in the sibling column
      // collapses so later siblings shift up to fill the gap.
      const dragDx = typeof homeX === "number" ? node.position.x - homeX : 0;
      const dragDy = nrInfo ? node.position.y - nrInfo.homePos.y : 0;
      const dragDist = Math.sqrt(dragDx * dragDx + dragDy * dragDy);
      const pastThreshold = dragDist > SNAP_BACK_RADIUS_PX;

      if (!childCandidate && curParentId && nrInfo?.siblingHomes) {
        // MindNode: the dragged node's Y always determines a slot index
        // in the sibling column, regardless of X. X is just personal-
        // touch offset. So we ALWAYS run the slot-reorder preview based
        // on cursor Y, then decide at drop-stop whether to also pin the
        // node with an X offset (if X is far from home column).
        const homes = nrInfo.siblingHomes;
        const draggedH = nrInfo.draggedHeight ?? h;
        const shifts = new Map<string, number>();

        // Same-parent multi-select: any other selected top-level id that
        // happens to be a sibling of the dragged node moves AS PART OF
        // the group. Per user spec — selected ids from a different
        // parent are NOT counted in this parent's reorder; they just
        // ride along via RF's native multi-drag delta.
        const movingSelectedIds: string[] = (
          nrInfo.selectedTopIds ?? []
        ).filter((id) => id !== nrInfo.nodeId && homes.has(id));
        const movingSet = new Set<string>([
          nrInfo.nodeId,
          ...movingSelectedIds,
        ]);

        // Each sibling tracks its phantom slot (autoY) AND its displayed
        // position (homeY). Reorder math operates on autoY so each
        // sibling's personal-touch offsetY survives the reorder. We sort
        // by autoY because that's the slot order — pinned siblings can
        // be visually anywhere, but their column slot is at autoY.
        // STATIC slots only — same-parent selected siblings are part of
        // the moving group and must not be shifted around.
        type SibSlot = {
          id: string;
          homeY: number;
          autoY: number;
          homeX: number;
          h: number;
        };
        const slots: SibSlot[] = [];
        for (const [sid, home] of homes) {
          if (movingSet.has(sid)) continue;
          slots.push({
            id: sid,
            homeY: home.y,
            autoY: home.autoY,
            homeX: home.x,
            h: home.h,
          });
        }
        slots.sort((a, b) => a.autoY - b.autoY);

        const isMulti = movingSelectedIds.length > 0;

        // Insertion index by cursor Y. Compare cursor to slots' DISPLAYED
        // midY — the user reads the visible column, so the cursor's
        // perceived "between two siblings" must use what they see.
        let insertIdx = slots.length;
        for (let i = 0; i < slots.length; i++) {
          const midY = slots[i].homeY + slots[i].h / 2;
          if (cy < midY) {
            insertIdx = i;
            break;
          }
        }

        // Multi-select drag of same-parent siblings (group): different
        // shift math because we vacate M+1 slots and re-insert them
        // consecutively at insertIdx. Static siblings just shift down by
        // groupHeight once they cross insertIdx. We forgo the precise
        // Y_orig autoY arithmetic that the single-drag branch uses — it
        // would require recomputing autoYs assuming a group occupying
        // M+1 slots, which depends on heights and ELK packing. Simple
        // uniform shift is correct on the +groupHeight side; layout-elk
        // re-layout on drop produces the final-correct positions.
        let columnX: number;
        let phantomY: number;
        if (isMulti) {
          // groupHeight = primary + every moving-selected sibling stacked
          // with GROUP_GAP_PX between them.
          let groupHeight = draggedH;
          for (const mid of movingSelectedIds) {
            const hm = homes.get(mid);
            if (hm) groupHeight += hm.h + GROUP_GAP_PX;
          }
          for (let i = 0; i < slots.length; i++) {
            const shift = i < insertIdx ? 0 : groupHeight;
            shifts.set(slots[i].id, shift);
          }
          if (slots.length) {
            if (insertIdx < slots.length) {
              siblingCandidate = { id: slots[insertIdx].id, mode: "before" };
            } else {
              siblingCandidate = {
                id: slots[slots.length - 1].id,
                mode: "after",
              };
            }
          }
          columnX = nrInfo.homeAutoX;
          phantomY =
            insertIdx < slots.length
              ? slots[insertIdx].autoY
              : slots.length
                ? slots[slots.length - 1].autoY +
                  slots[slots.length - 1].h +
                  GROUP_GAP_PX
                : nrInfo.homeAutoY;
        } else {
          // Single-drag — original Y_orig math, untouched.
          let originalIdx = slots.length;
          const draggedAutoY = nrInfo.homeAutoY;
          for (let i = 0; i < slots.length; i++) {
            if (draggedAutoY < slots[i].autoY) {
              originalIdx = i;
              break;
            }
          }
          // Y_orig[k] = AUTO slot Y at full ord k (with dragged included).
          // Built from auto Ys, NOT displayed Ys, so personal-touch
          // offsets don't leak into reorder math:
          //   k < originalIdx → slots[k].autoY
          //   k === originalIdx → nrInfo.homeAutoY
          //   k > originalIdx → slots[k-1].autoY
          const Y_orig: number[] = new Array(slots.length + 1);
          for (let k = 0; k <= slots.length; k++) {
            if (k < originalIdx) Y_orig[k] = slots[k].autoY;
            else if (k === originalIdx) Y_orig[k] = nrInfo.homeAutoY;
            else Y_orig[k] = slots[k - 1].autoY;
          }
          // Shift formula: each sibling moves its slot, keeps its offset.
          //   target displayed Y = Y_orig[newOrd] + own_offsetY
          //   own_offsetY = home.y − autoY
          //   shift = target − home.y = Y_orig[newOrd] − autoY
          for (let i = 0; i < slots.length; i++) {
            const newOrd = i < insertIdx ? i : i + 1;
            shifts.set(slots[i].id, Y_orig[newOrd] - slots[i].autoY);
          }
          if (slots.length) {
            if (insertIdx < slots.length) {
              siblingCandidate = { id: slots[insertIdx].id, mode: "before" };
            } else {
              siblingCandidate = {
                id: slots[slots.length - 1].id,
                mode: "after",
              };
            }
          }
          columnX = nrInfo.homeAutoX;
          phantomY = slots.length ? Y_orig[insertIdx] : nrInfo.homeAutoY;
        }
        nrInfo.phantomX = columnX;
        nrInfo.phantomY = phantomY;
        nrInfo.phantomIdx = insertIdx;

        // Ghost is only shown when the drop will LAND IN THE COLUMN
        // (clean slot snap, no X offset). When the cursor is far X-out
        // the drop will still reorder, but ALSO add personal-touch X
        // offset — and the visual cue for that case is the dragged
        // node itself sitting offset, not a separate ghost. Showing a
        // ghost in the column while cursor is far away is misleading
        // (looks like "I'll snap here" when actually I'll pin offset).
        const ghostXZone = (node.measured?.width ?? w) * PHANTOM_X_ZONE_MULT;
        const ghostPdx = Math.abs(node.position.x - columnX);
        const ghostInColumn = ghostPdx <= ghostXZone;
        if (pastThreshold && ghostInColumn) {
          setDragGhost({
            x: columnX,
            y: phantomY,
            width: node.measured?.width ?? w,
            height: draggedH,
            label: node.data.label,
          });
        } else {
          setDragGhost(null);
        }

        // Apply shifts live whenever cursor is past snap threshold —
        // X position is irrelevant. The slot index is determined by
        // cursor Y; X just adds personal-touch offset on drop.
        if (pastThreshold && (shifts.size || isMulti)) {
          const targetsMap = new Map<string, { x: number; y: number }>();
          for (const [sid, shift] of shifts) {
            const hm = homes.get(sid);
            if (!hm) continue;
            // Shift the sibling itself.
            targetsMap.set(sid, { x: hm.x, y: hm.y + shift });
            // Shift its entire subtree by the same delta so descendants
            // follow their parent during the live preview.
            const subtreeHomes = nrInfo.siblingSubtreeHomes?.get(sid);
            if (subtreeHomes) {
              for (const [did, dhm] of subtreeHomes) {
                targetsMap.set(did, { x: dhm.x, y: dhm.y + shift });
              }
            }
          }
          // Note: moving same-parent siblings are intentionally NOT
          // forced into stacked phantom positions during the live
          // preview. RF's native multi-drag already translates each of
          // them by the primary's drag delta — preserving the relative
          // X/Y between selected nodes (e.g. drag A by +5x with A,B
          // selected → A and B both shift by +5x). Snap-to-stacked-
          // slots happens only on drop (see the multi-select branch in
          // onNodeDragStop). Pinning them here would magnetise them to
          // the column the moment the cursor enters the parent zone.
          pendingLiveReorderRef.current = targetsMap;
          if (liveReorderRafRef.current == null) {
            liveReorderRafRef.current = requestAnimationFrame(() => {
              liveReorderRafRef.current = null;
              const tgt = pendingLiveReorderRef.current;
              pendingLiveReorderRef.current = null;
              if (!tgt) return;
              const latest = useMindMapStore.getState();
              const moved = latest.nodes.map((n) => {
                const target = tgt.get(n.id);
                if (!target) return n;
                if (n.position.x === target.x && n.position.y === target.y)
                  return n;
                return { ...n, position: target };
              });
              setGraph(moved, latest.edges, false);
            });
          }
        }
      }

      // When we're previewing a sibling reorder, skip the rigid-group
      // rAF below — otherwise it resets descendants to home and fights
      // the live preview.
      if (inSiblingColumn && siblingCandidate) {
        // Still run drop-target dwell + candidate commit below, but do
        // not let rigid-group path overwrite our sibling positions.
      }

      // Phase 2 — legacy thin-band sibling fallback. Only runs when the
      // user is OUTSIDE the sibling column but hovers a narrow strip
      // above/below a non-sibling node (cross-column drop).
      if (!childCandidate && !siblingCandidate) {
        for (const n of cur.nodes) {
          if (subtree.has(n.id) || n.selected) continue;
          if (n.data.depth === 0) continue;
          const nw = n.measured?.width ?? 120;
          const nh = n.measured?.height ?? 40;
          const inX = cx >= n.position.x - 20 && cx <= n.position.x + nw + 20;
          if (!inX) continue;
          if (cy >= n.position.y - SIBLING_BAND_PX && cy < n.position.y) {
            siblingCandidate = { id: n.id, mode: "before" };
            break;
          }
          if (
            cy > n.position.y + nh &&
            cy <= n.position.y + nh + SIBLING_BAND_PX
          ) {
            siblingCandidate = { id: n.id, mode: "after" };
            break;
          }
        }
      }

      // Only child-drop (reparent) uses dwell-based `dropTarget` commit.
      // Sibling-reorder is decided at drop-stop by the phantom-distance
      // magnet, not by hover/dwell — the phantom slot is always visible
      // while dragging, and the node only snaps to it when the cursor
      // is close. This matches user-specified MindNode behaviour:
      // "magnet kicks in only when close to phantom, else snap back".
      const candidate: {
        id: string;
        mode: "child" | "before" | "after";
      } | null = childCandidate ? { id: childCandidate, mode: "child" } : null;

      if (candidate) {
        // Dwell-hysteresis: the cursor must stay on the same candidate for
        // DWELL_MS before we commit it to `dropTarget`. Flicking across
        // multiple nodes in quick succession resets the timer.
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const prev = dwellRef.current;
        if (!prev || prev.id !== candidate.id || prev.mode !== candidate.mode) {
          dwellRef.current = { ...candidate, at: now };
          // Don't commit yet, and don't show a ghost while the user is
          // still deciding — feedback will appear after DWELL_MS.
          if (dropTarget) setDropTarget(null);
          return;
        }
        if (now - prev.at >= DWELL_MS) {
          if (
            dropTarget?.id !== candidate.id ||
            dropTarget?.mode !== candidate.mode
          ) {
            setDropTarget(candidate);
          }
        }
        return;
      }

      // No child-candidate under cursor — clear any pending dwell +
      // active drop. Phantom ghost in the sibling column was set by
      // Phase 0 and is still valid; don't touch it here.
      if (dwellRef.current) dwellRef.current = null;
      if (dropTarget) setDropTarget(null);
    },
    [editable, setGraph, dropTarget],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: RfNode) => {
      if (!editable) return;
      // Re-enable CSS transitions now that drag ended.
      wrapperRef.current?.classList.remove("mind-dragging");
      // Re-enable RF → Zustand position sync. Final positions are written
      // authoritatively below via setCustomPosition / setGraph.
      isDraggingRef.current = false;
      // Cancel any in-flight throttled rAF tick and drop its payload —
      // drop-stop logic below will compute the final pinned positions
      // authoritatively, so the throttled update must not run after it.
      if (dragRafRef.current != null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      pendingDragPayloadRef.current = null;
      if (liveReorderRafRef.current != null) {
        cancelAnimationFrame(liveReorderRafRef.current);
        liveReorderRafRef.current = null;
      }
      pendingLiveReorderRef.current = null;
      const rootInfo = rootDragRef.current;
      const nonRootInfo = nonRootDragRef.current;
      rootDragRef.current = null;
      nonRootDragRef.current = null;
      setDragGhost(null);

      // Root drag: store displacement as a delta-offset (MindNode Personal
      // Touch model) on the root node only. layout-elk's BFS cascade
      // propagates the root's offset down to unpinned descendants so the
      // subtree follows rigidly during the next relayout. Offset-only
      // model — `setCustomPosition` (legacy absolute pin) is no longer
      // written; layout-elk still reads it for backward compat with maps
      // imported from MindNode files but no editor flow creates new ones.
      //
      // newOffset = oldOffset + drag-displacement, so consecutive root
      // drags accumulate cleanly instead of resetting to the latest delta.
      if (rootInfo && node.data.depth === 0) {
        const cur = useMindMapStore.getState();
        const dx = node.position.x - rootInfo.startX;
        const dy = node.position.y - rootInfo.startY;
        const root = cur.nodes.find((n) => n.id === node.id);
        const raw = (root?.data?.raw?.data ?? {}) as Record<string, unknown>;
        const oldOffX =
          typeof raw.offsetX === "number" ? (raw.offsetX as number) : 0;
        const oldOffY =
          typeof raw.offsetY === "number" ? (raw.offsetY as number) : 0;
        const ns = setOffset(cur.nodes, node.id, oldOffX + dx, oldOffY + dy);
        mutate({ nodes: ns, edges: cur.edges });
        return;
      }

      // Drop onto another node → reparent. We skip the case where the
      // drop target *is* the node's current parent: MindNode treats that
      // as a snap-back (no-op) rather than a self-reparent. Multi-select
      // aware: every co-selected non-root node gets reparented to the
      // same drop target, in selection order. Without this branch the
      // primary moves to the new parent but the rest of the group stays
      // behind / snaps to default.
      const drop = dropTarget;
      setDropTarget(null);
      dwellRef.current = null;
      const curParentId = nonRootInfo?.parentId;
      const isSelfParentDrop =
        drop?.mode === "child" && drop.id === curParentId;
      if (
        drop &&
        drop.id !== node.id &&
        node.data.depth !== 0 &&
        !isSelfParentDrop
      ) {
        const cur = useMindMapStore.getState();

        // Resolve the full reparent target set. Same precedence as the
        // offset block below: snapshot from drag-start (most accurate
        // for the drag the user actually started) → live selection ref
        // (recovers if RF re-emitted selection mid-drag) → primary alone.
        const idsFromSnapshot = nonRootInfo?.selectedTopIds ?? [];
        const liveSelected = Array.from(selectedIdsRef.current);
        const reparentIds =
          idsFromSnapshot.length > 1
            ? idsFromSnapshot
            : liveSelected.length > 1 && liveSelected.includes(node.id)
              ? liveSelected.filter((id) => {
                  const n = cur.nodes.find((x) => x.id === id);
                  return n && n.data.depth !== 0;
                })
              : [node.id];

        // Drop target itself can't be reparented into itself. moveNode
        // already short-circuits cycle attempts (target inside its own
        // subtree), so no extra ancestor check is required.
        const finalIds = reparentIds.filter((id) => id !== drop.id);
        if (finalIds.length === 0) return;

        // Any structural change (reparent or sibling-reorder) must wipe
        // personal-touch pins on every sibling in BOTH the old and new
        // parent's child-groups for EACH moved node. Without this, a
        // stale pin on a cousin from an earlier drag keeps it anchored
        // after the auto-layout that follows, producing the overlap /
        // long-gap bugs seen on maps with history of manual drags.
        const newParentId =
          drop.mode === "child"
            ? drop.id
            : cur.edges.find((e) => e.target === drop.id)?.source;
        const toClear = new Set<string>(finalIds);
        const parentSet = new Set<string>();
        if (newParentId) parentSet.add(newParentId);
        for (const e of cur.edges) {
          if (finalIds.includes(e.target)) parentSet.add(e.source);
        }
        for (const pid of parentSet) {
          for (const e of cur.edges) {
            if (e.source === pid) toClear.add(e.target);
          }
        }
        let ns = cur.nodes;
        for (const id of toClear) ns = clearCustomPosition(ns, id);

        // Apply the move per node, threading the result. moveNode /
        // moveNodeAsSibling are no-ops on cycle / same-parent attempts
        // so chaining is safe even when one of finalIds is already a
        // child of drop.id.
        let nextNs = ns;
        let nextEs = cur.edges;
        for (const mid of finalIds) {
          if (drop.mode === "child") {
            const r = moveNode(nextNs, nextEs, mid, drop.id);
            nextNs = r.nodes;
            nextEs = r.edges;
          } else {
            const r = moveNodeAsSibling(
              nextNs,
              nextEs,
              mid,
              drop.id,
              drop.mode,
            );
            nextNs = r.nodes;
            nextEs = r.edges;
          }
        }
        mutate({ nodes: nextNs, edges: nextEs });
        return;
      }

      // Non-root free drag.
      if (nonRootInfo && nonRootInfo.nodeId === node.id) {
        const dx = node.position.x - nonRootInfo.homePos.x;
        const dy = node.position.y - nonRootInfo.homePos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const cur = useMindMapStore.getState();

        // Co-selected IDs from drag-start snapshot — only the explicitly
        // selected top-level ids, NOT their descendants. Descendants must
        // never receive their own setOffset; they follow via the offset
        // cascade in layout-elk. RF can deselect mid-drag, so we trust the
        // snapshot first; fall back to the live selectedIdsRef and finally
        // to the dragged node alone.
        const idsFromSnapshot = nonRootInfo.selectedTopIds ?? [];
        const liveSelected = Array.from(selectedIdsRef.current);
        const ids =
          idsFromSnapshot.length > 1
            ? idsFromSnapshot
            : liveSelected.length > 1 && liveSelected.includes(node.id)
              ? liveSelected.filter((id) => {
                  const n = cur.nodes.find((x) => x.id === id);
                  return n && n.data.depth !== 0;
                })
              : [node.id];

        // Multi-select rigid-group drag: every selected node accumulates
        // (dx, dy) into its own offsetX/Y. Skip slot-reorder / phantom
        // logic (those are single-node-only — they decide a single Y slot
        // inside parent). Group drag is a translation, not a per-node
        // reorder. Matches default xyflow behaviour where dragging any
        // selected node moves the whole selection.
        //
        // Offset-only model: same accumulation rule as the single-node
        // path below — newOffset = oldOffset + (dx, dy). layout-elk's
        // cascade then carries each pinned node's offset down to its own
        // descendants, so a co-selected parent rigidly drags its subtree.
        const isGroupDrag = (nonRootInfo.selectedTopIds?.length ?? 0) > 1;
        if (isGroupDrag && dist > SNAP_BACK_RADIUS_PX) {
          let ns = cur.nodes;
          for (const sid of nonRootInfo.selectedTopIds!) {
            const sNode = cur.nodes.find((n) => n.id === sid);
            if (!sNode) continue;
            const sRaw = (sNode.data?.raw?.data ?? {}) as Record<string, unknown>;
            const oldX =
              typeof sRaw.offsetX === "number" ? (sRaw.offsetX as number) : 0;
            const oldY =
              typeof sRaw.offsetY === "number" ? (sRaw.offsetY as number) : 0;
            ns = setOffset(ns, sid, oldX + dx, oldY + dy);
          }
          setGraph(ns, cur.edges, true);
          emitChange(ns, cur.edges);
          return;
        }

        if (dist <= SNAP_BACK_RADIUS_PX) {
          // Inside snap-back radius — mini-drag.
          // For nodes WITHOUT prior offset: snap back (clearCustomPosition).
          //   This is the original "click / miniature nudge" case — node
          //   was at auto-layout, user barely moved → return to auto.
          // For nodes WITH prior offset: keep them where they are.
          //   The user re-grabbed an already-pinned node and barely moved
          //   it; clearing here would silently un-pin them, losing the
          //   personal-touch offset. MindNode preserves the offset on
          //   sub-threshold drags of pinned nodes.
          const wasPinned = (id: string): boolean => {
            const raw = (cur.nodes.find((n) => n.id === id)?.data.raw.data ??
              {}) as Record<string, unknown>;
            return (
              (typeof raw.offsetX === "number" && raw.offsetX !== 0) ||
              (typeof raw.offsetY === "number" && raw.offsetY !== 0) ||
              (typeof raw.customLeft === "number" &&
                typeof raw.customTop === "number")
            );
          };
          let ns = cur.nodes;
          for (const nid of ids) {
            if (!wasPinned(nid)) ns = clearCustomPosition(ns, nid);
          }
          mutate({ nodes: ns, edges: cur.edges });
          return;
        }

        // Drag-stop decision (MindNode §8/§10 + observed behaviour from
        // user-supplied screenshots):
        //
        //   Past snap threshold → ALWAYS commit slot reorder based on
        //   cursor Y at drop. Y is the slot-index selector regardless
        //   of X. Then conditionally add X offset on top:
        //     • X inside column (pdx < 1.5 × nodeWidth) → clean slot
        //       change, no offset.
        //     • X outside column → reorder + setOffset(xDelta, 0)
        //       → slot is reserved at the new index (visible as gap),
        //         node displays at offset position with asterisk.
        //
        // This matches the user's screenshots where 1111 is dragged
        // to a new vertical slot AND has X offset — the column shows
        // a gap at the new slot, and 1111 floats off to the side.
        // Earlier "in-column-only commits reorder" gated reorders on
        // X position, which broke "drag node up + slightly to side"
        // → it pinned without changing slot order.
        const phantomX = nonRootInfo.phantomX;
        const phantomIdx = nonRootInfo.phantomIdx;
        // Sibling-reorder is a SINGLE-NODE operation: it picks a new
        // slot for the primary inside its parent's child list. In a
        // multi-select rigid-group drag the user is translating the
        // whole group as one — reordering the primary into a new slot
        // while the other co-selected nodes only get visual offsets
        // produces the "snaps back after drop" bug (co-selected lose
        // their pin because this branch returns early before reaching
        // the per-node setOffset loop below). Skip reorder when the
        // group has more than one node and fall through to the pure
        // offset-pin block — every selected node lands at home + delta.
        // Multi-select sibling-reorder drop: when more than one same-
        // parent sibling is in the selection, chain moveNodeAsSibling so
        // the entire group lands in consecutive slots at insertIdx,
        // preserving the user's drag-start order (sorted by autoY).
        // Only triggers when the moving group actually has same-parent
        // co-selected siblings — pure-cross-parent multi-selects fall
        // through to the offset-pin block below.
        const sameParentMoving = (nonRootInfo.selectedTopIds ?? []).filter(
          (id) => id !== node.id && nonRootInfo.siblingHomes?.has(id),
        );
        if (
          sameParentMoving.length > 0 &&
          typeof phantomX === "number" &&
          typeof phantomIdx === "number" &&
          nonRootInfo.parentId
        ) {
          // Anchor lookup needs to use STATIC home-siblings only — the
          // moving group is conceptually being lifted out and re-inserted
          // at insertIdx, so the anchor is the sibling currently sitting
          // at insertIdx among the non-moving ones.
          const movingSet = new Set<string>([node.id, ...sameParentMoving]);
          const staticHomeSibs = Array.from(
            nonRootInfo.siblingHomes?.entries() ?? [],
          )
            .filter(([id]) => !movingSet.has(id))
            .sort((a, b) => a[1].autoY - b[1].autoY)
            .map(([id]) => id);

          let anchorId: string | undefined;
          let mode: "before" | "after" = "before";
          if (phantomIdx < staticHomeSibs.length) {
            anchorId = staticHomeSibs[phantomIdx];
            mode = "before";
          } else if (staticHomeSibs.length) {
            anchorId = staticHomeSibs[staticHomeSibs.length - 1];
            mode = "after";
          }

          // Clear pins on every node about to be reordered so layout-elk
          // packs them tight in their new slots without stale offsets.
          let ns = cur.nodes;
          ns = clearCustomPosition(ns, node.id);
          for (const id of sameParentMoving) {
            ns = clearCustomPosition(ns, id);
          }
          let es = cur.edges;

          if (anchorId) {
            // Primary first.
            const r1 = moveNodeAsSibling(ns, es, node.id, anchorId, mode);
            ns = r1.nodes;
            es = r1.edges;
            // Then each moving sibling, in original autoY order, goes
            // immediately AFTER the previous one in the chain. Result:
            // the group occupies M+1 consecutive slots.
            const orderedMoving = sameParentMoving
              .map((id) => ({
                id,
                autoY: nonRootInfo.siblingHomes!.get(id)!.autoY,
              }))
              .sort((a, b) => a.autoY - b.autoY);
            let prevId = node.id;
            for (const { id } of orderedMoving) {
              const r = moveNodeAsSibling(ns, es, id, prevId, "after");
              ns = r.nodes;
              es = r.edges;
              prevId = id;
            }

            // Personal-touch X/Y offset for the whole group. Mirrors
            // the single-drag rule:
            //   • X axis — PHANTOM_X_ZONE = 1.5 × node width: small
            //     horizontal drift snaps clean to column, big drift
            //     preserves the X delta as a per-node offset.
            //   • Y axis — Y_OFFSET_THRESHOLD = 10 px: tight threshold,
            //     any meaningful vertical deviation from primary's
            //     phantom slot Y is treated as user intent and saved
            //     as a per-node offset. Without this the group always
            //     snapped to the clean phantom Y slots.
            // Same delta applied to every member of the group so the
            // user's stack stays rigid.
            const phantomYBase = nonRootInfo.phantomY ?? nonRootInfo.homeAutoY;
            const phantomXZone =
              (node.measured?.width ?? FALLBACK_NODE_WIDTH) *
              PHANTOM_X_ZONE_MULT;
            const rawXDelta = node.position.x - phantomX;
            const rawYDelta = node.position.y - phantomYBase;
            const groupOffsetX =
              Math.abs(rawXDelta) > phantomXZone ? rawXDelta : 0;
            const groupOffsetY =
              Math.abs(rawYDelta) > Y_OFFSET_THRESHOLD_PX ? rawYDelta : 0;
            if (groupOffsetX !== 0 || groupOffsetY !== 0) {
              ns = setOffset(ns, node.id, groupOffsetX, groupOffsetY);
              for (const { id } of orderedMoving) {
                ns = setOffset(ns, id, groupOffsetX, groupOffsetY);
              }
            }
          } else {
            // No static siblings — parent has only the moving group.
            // Pins are already cleared; layout-elk will pack them into
            // a clean column based on the existing edge order.
          }
          mutate({ nodes: ns, edges: es });
          return;
        }

        if (
          ids.length === 1 &&
          typeof phantomX === "number" &&
          typeof phantomIdx === "number" &&
          nonRootInfo.parentId
        ) {
          const parentId = nonRootInfo.parentId;
          const parentEdges = cur.edges.filter((e) => e.source === parentId);
          // Sort siblings by AUTO slot Y, not displayed Y — phantomIdx
          // was computed in autoY space (each sibling has its own slot
          // independent of personal-touch offset), so the anchor must
          // be looked up in the same space.
          const homeSibs = Array.from(nonRootInfo.siblingHomes?.entries() ?? [])
            .sort((a, b) => a[1].autoY - b[1].autoY)
            .map(([id]) => id);
          let anchorId: string | undefined;
          let mode: "before" | "after" = "before";
          if (phantomIdx < homeSibs.length) {
            anchorId = homeSibs[phantomIdx];
            mode = "before";
          } else if (homeSibs.length) {
            anchorId = homeSibs[homeSibs.length - 1];
            mode = "after";
          }
          if (anchorId) {
            let ns = cur.nodes;
            // ONLY clear the dragged node's pin — its offset/customLeft
            // is about to be replaced (cleanly or with a new X offset).
            // Other siblings keep their personal-touch offsets: each
            // sibling has its own phantom slot (auto position) AND its
            // own real position (slot + offset). Reordering one node
            // must not erase the others' independent personal touches.
            ns = clearCustomPosition(ns, node.id);
            // Commit slot reorder.
            const reordered = moveNodeAsSibling(
              ns,
              cur.edges,
              node.id,
              anchorId,
              mode,
            );

            // Personal-touch offset = drop position − phantom slot.
            // Each node has TWO independent positions: the phantom (slot
            // Y/X from layout) and the real (where user dropped). They
            // are stored as offsetX/Y deltas relative to phantom slot.
            //
            // X axis: the column zone is wide (1.5 × node width), so
            //   small horizontal drift counts as "still in column" and
            //   produces no X offset. Past that → user explicitly
            //   pulled the node aside → keep X offset.
            // Y axis: tight threshold (10 px). Any meaningful vertical
            //   deviation from the phantom slot is a personal-touch
            //   intent — user wants the node at this Y, not snapped to
            //   the slot. Earlier yOffset=0 made nodes pulled UP/DOWN
            //   snap back to slot, which broke vertical pinning.
            const phantomY = nonRootInfo.phantomY ?? nonRootInfo.homeAutoY;
            const phantomXZone =
              (node.measured?.width ?? FALLBACK_NODE_WIDTH) *
              PHANTOM_X_ZONE_MULT;
            const rawXDelta = node.position.x - phantomX;
            const rawYDelta = node.position.y - phantomY;
            const offsetX = Math.abs(rawXDelta) > phantomXZone ? rawXDelta : 0;
            const offsetY =
              Math.abs(rawYDelta) > Y_OFFSET_THRESHOLD_PX ? rawYDelta : 0;
            if (offsetX !== 0 || offsetY !== 0) {
              const finalNs = setOffset(
                reordered.nodes,
                node.id,
                offsetX,
                offsetY,
              );
              mutate({ nodes: finalNs, edges: reordered.edges });
            } else {
              mutate(reordered);
            }
            return;
          }
        }

        // Pin dragged + co-selected via DELTA model (MindNode "Personal
        // Touch" / Flexible Layout). offset = drop − home; if the node
        // already had an offset before drag, accumulate (newOffset =
        // oldOffset + delta) so consecutive drags compose rather than
        // overwrite.
        //
        // Why offset, not customLeft/Top: the absolute model breaks the
        // parent-child-follow invariant (§7 of MindNode spec). Pinned
        // child stays at fixed canvas coords when its parent moves; with
        // offset, layout-elk re-applies the delta on top of the new
        // auto-position so the child follows the parent.
        const oldOffsetOf = (id: string): { x: number; y: number } => {
          const raw = (cur.nodes.find((n) => n.id === id)?.data.raw.data ??
            {}) as Record<string, unknown>;
          return {
            x: typeof raw.offsetX === "number" ? (raw.offsetX as number) : 0,
            y: typeof raw.offsetY === "number" ? (raw.offsetY as number) : 0,
          };
        };
        // Primary's drop delta is the source of truth — RF gives it to us
        // synchronously via node.position. Each co-selected node gets the
        // SAME delta on top of its prior offset (rigid-group semantics).
        // We deliberately don't read non-primary positions off the store
        // here: rAF may have been cancelled at drag-stop entry before
        // landing the last visual update, leaving n.position == h and a
        // zero delta — secondary nodes would then stay put while the
        // primary moves.
        const groupDx = node.position.x - nonRootInfo.homePos.x;
        const groupDy = node.position.y - nonRootInfo.homePos.y;
        let ns = cur.nodes;
        for (const nid of ids) {
          const oldOff = oldOffsetOf(nid);
          ns = setOffset(ns, nid, oldOff.x + groupDx, oldOff.y + groupDy);
        }
        // Co-selected protection: when the user is dragging a multi-
        // selection rigid group, the cleanup loops below MUST NOT touch
        // any of the co-selected ids. We just wrote their fresh offsets
        // (line above) — wiping them via clearCustomPosition would
        // collapse each co-selected node back to its auto-position the
        // moment layout-elk runs, producing the "drag releases and the
        // node snaps to default" bug.
        const idsProtected = new Set<string>(ids);

        // Dragged node's descendants reflow under its new position. Skip
        // any descendant that's itself a co-selected top-level id (user
        // may have multi-selected a parent + one of its children, and
        // the child carries its own offset that we just refreshed).
        if (nonRootInfo.descendants?.size) {
          for (const cid of nonRootInfo.descendants.keys()) {
            if (idsProtected.has(cid)) continue;
            ns = clearCustomPosition(ns, cid);
          }
        }

        // Clear any stale custom positions on ALL siblings of the dragged
        // node. During the live-preview we write shifted positions to
        // them via setGraph; if they remain un-cleared, the next layoutElk
        // run would see them as auto nodes with stale X/Y values. ELK
        // ignores position but our subtree anti-overlap reads posMap
        // that starts from ELK's output, so explicit clearCustomPosition
        // here guarantees a clean slate. Co-selected siblings are
        // exempted (see idsProtected comment above).
        if (nonRootInfo.parentId) {
          for (const e of cur.edges) {
            if (
              e.source === nonRootInfo.parentId &&
              e.target !== node.id &&
              !idsProtected.has(e.target)
            ) {
              ns = clearCustomPosition(ns, e.target);
            }
          }
        }

        // Relayout. Pinned primary is invisible to column packing (per
        // layout-elk.ts subtreeExtent rule), so siblings auto-pack tight
        // and gap where the dragged node used to sit closes naturally.
        const visible = filterCollapsed(ns, cur.edges);
        layoutElk(visible.nodes, visible.edges).then((laid) => {
          if (!mountedRef.current) return;
          const posMap = new Map(laid.nodes.map((n) => [n.id, n.position]));
          const merged = ns.map((n) => {
            const pos = posMap.get(n.id);
            return pos ? { ...n, position: pos } : n;
          });
          setGraph(merged, cur.edges, true);
          emitChange(merged, cur.edges);
        });
        return;
      }

      // Fallback — shouldn't normally reach here.
      const cur = useMindMapStore.getState();
      mutate({ nodes: cur.nodes, edges: cur.edges });
    },
    [editable, setGraph, emitChange, dropTarget, mutate],
  );

  const closeMenu = useCallback(() => {
    setMenu(null);
    // Exit edit mode when clicking empty space
    if (editingIdRef.current) {
      editingIdRef.current = null;
      setEditingId(null);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    exportAs: async (type) => {
      if (type === "json") {
        const s = useMindMapStore.getState();
        const outlineJson = rfToOutline(s.nodes, s.edges);
        const blob = new Blob(
          [JSON.stringify({ title, outline: outlineJson }, null, 2)],
          {
            type: "application/json",
          },
        );
        downloadBlob(blob, `${title || "mind-map"}.json`);
        return;
      }
      const el = document.querySelector(
        ".react-flow__viewport",
      ) as HTMLElement | null;
      if (!el) return;
      const mod = await import("html-to-image");
      if (type === "png") {
        const dataUrl = await mod.toPng(el, {
          backgroundColor: "#ffffff",
          pixelRatio: 2,
        });
        downloadUrl(dataUrl, `${title || "mind-map"}.png`);
      } else if (type === "svg") {
        const dataUrl = await mod.toSvg(el);
        downloadUrl(dataUrl, `${title || "mind-map"}.svg`);
      } else if (type === "pdf") {
        console.warn("[rf-mind-map] pdf export not implemented yet");
      }
    },
    undo: () => {
      if (undo()) {
        const s = useMindMapStore.getState();
        emitChange(s.nodes, s.edges);
      }
    },
    redo: () => {
      if (redo()) {
        const s = useMindMapStore.getState();
        emitChange(s.nodes, s.edges);
      }
    },
    renameRoot: (label: string) => {
      const cur = useMindMapStore.getState();
      const root = cur.nodes.find((n) => n.data.depth === 0);
      if (!root) return;
      const trimmed = label.trim();
      if (!trimmed || root.data.label === trimmed) return;
      const renamed = renameNode(cur.nodes, root.id, trimmed);
      // pushHistory=false: live keystroke, no snapshot. Caller commits
      // a single atomic snapshot via commitHistory() on blur/Enter.
      setGraph(renamed, cur.edges, false);
      emitChange(renamed, cur.edges);
    },
    commitHistory: () => {
      useMindMapStore.getState().commit();
    },
    toggleHotkeysHelp: () => {
      setHotkeysHelpOpen((v) => !v);
    },
    addNode: () => {
      // Clear any stale edit state first so a stuck contentEditable can't
      // swallow the creation, then add via the same relayout+edit path Tab
      // uses — but invoked directly, not through the keydown handler.
      editingIdRef.current = null;
      const cur = useMindMapStore.getState();
      const sel = selectedIdRef.current;
      // Child of the selection, or of the root when nothing is selected — so
      // the new node lands inside the tree, never as an off-screen new root.
      const parentId =
        sel && cur.nodes.some((n) => n.id === sel)
          ? sel
          : cur.nodes.find((n) => n.data.depth === 0)?.id ?? null;
      if (!parentId) {
        addRootNode();
        return;
      }
      const res = addChild(cur.nodes, cur.edges, parentId);
      if (!res.newId) return;
      const selected = applySelection(res.nodes, res.newId);
      mutate({ nodes: selected, edges: res.edges }, () => {
        setSelectedId(res.newId);
        setEditingId(res.newId);
      });
      // Pan to the fresh node so it's never created off-screen (the "nothing
      // happens / only shows after reload" symptom: the node IS created and
      // saved, it just lands outside the viewport). A single rAF is too early —
      // the node is unmeasured at (0,0) until ELK lays it out and RF measures
      // it — so poll for a real measured position, then center on it.
      // THE root cause of "new node only shows after reload": with culling on
      // (onlyRenderVisibleElements), React Flow never measures a node outside
      // the viewport, and layoutElk parks unmeasured nodes at (0,0) — so a
      // fresh off-screen node is invisible until a full reload re-lays it out.
      // The old editor rendered every node, so new ones appeared instantly.
      // Restore that for creation: turn culling OFF so the new node renders and
      // measures wherever it is, center on it, then turn culling back on (it's
      // on screen now, so it keeps rendering).
      setCullOffscreen(false);
      let tries = 0;
      const reveal = () => {
        const n = useMindMapStore.getState().nodes.find((x) => x.id === res.newId);
        if (n && n.measured && (n.position.x !== 0 || n.position.y !== 0)) {
          rf.setCenter(
            n.position.x + (n.measured.width ?? 100) / 2,
            n.position.y + (n.measured.height ?? 20) / 2,
            { zoom: 1, duration: 400 },
          );
          setTimeout(() => setCullOffscreen(true), 900);
        } else if (tries++ < 40) {
          setTimeout(reveal, 60);
        }
      };
      setTimeout(reveal, 120);
    },
    connectSelected: () => {
      const order = selectionOrderRef.current;
      if (order.length < 2) return;
      createConnectionBetween(order[0], order[1]);
    },
  }));

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      document.exitFullscreen?.();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  return (
    <MindMapCtx.Provider value={actions}>
      <style>{TRANSITION_CSS}</style>
      <div
        ref={wrapperRef}
        className={cn("mind-map-canvas", className, focusBranchId && "mind-focus-mode")}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          // Canvas surface follows the app theme via CSS variables.
          // Node text is `var(--mm-node-text)` so it stays readable on both.
          background: "var(--mm-canvas-bg)",
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={allEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={applyEdgeChanges}
          onSelectionChange={onSelectionChange}
          onNodeClick={onNodeClick}
          onNodeContextMenu={(e) => e.preventDefault()}
          multiSelectionKeyCode={["Shift", "Meta", "Control"]}
          selectNodesOnDrag={false}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          panOnScroll
          panOnScrollSpeed={0.6}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={closeMenu}
          // Auto-fit is triggered explicitly from the post-measure
          // useEffect (search "didPostMeasureRef" in this file): it
          // waits for node measurements to settle, runs a final
          // layoutElk pass with real sizes, THEN calls rf.fitView().
          // Doing it here as a prop or onInit fires too early — before
          // the post-measure relayout shifts node positions, so the
          // viewport ends up fitted to a stale layout and the very
          // first edit appears to "shift the map" on screen.
          minZoom={0.2}
          maxZoom={2}
          nodesDraggable={editable}
          nodesConnectable={false}
          elementsSelectable
          // Off-viewport nodes must mount during the FIRST measure round so
          // Phase-2 layoutElk gets real heights (BUG-01). Once post-measure
          // relayout has settled, flip culling on so drag/pan only re-render
          // visible nodes — biggest single win on 300+ node maps.
          onlyRenderVisibleElements={cullOffscreen}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="var(--mm-grid-color)" />
          <Controls
            showInteractive={false}
            style={{
              background: "var(--mm-control-bg)",
              border: "1px solid var(--mm-control-border)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
            className="mm-controls"
          />
          <MiniMap
            pannable
            zoomable
            style={{
              background: "var(--mm-minimap-bg)",
              border: "1px solid var(--mm-control-border)",
            }}
            maskColor="var(--mm-minimap-mask)"
            nodeColor="var(--mm-minimap-node)"
          />
          <FrameOverlay nodes={nodes} edges={edges} />
          {dragGhost && (
            <ViewportPortal>
              <div
                style={{
                  position: "absolute",
                  left: dragGhost.x,
                  top: dragGhost.y,
                  width: dragGhost.width,
                  height: dragGhost.height,
                  borderRadius: 8,
                  border: "2px dashed rgba(0,0,0,0.2)",
                  background: "rgba(0,0,0,0.04)",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  color: "rgba(0,0,0,0.25)",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {dragGhost.label}
              </div>
            </ViewportPortal>
          )}
          {searchOpen && (
            <Panel position="top-center">
              <SearchPanel
                onSelect={(id) => setSelectedId(id)}
                onClose={() => setSearchOpen(false)}
              />
            </Panel>
          )}
          <HotkeysHelp
            open={hotkeysHelpOpen}
            onClose={() => setHotkeysHelpOpen(false)}
          />

          <Panel position="top-right">
            <div style={{ display: "flex", gap: 6 }}>
              {editable && (
                <>
                  <button
                    onClick={() => {
                      if (undo()) {
                        const s = useMindMapStore.getState();
                        emitChange(s.nodes, s.edges);
                      }
                    }}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.08)",
                      background: "#ffffff",
                      cursor: canUndo ? "pointer" : "default",
                      opacity: canUndo ? 1 : 0.4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                      padding: 0,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1a1a1a"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 14 4 9l5-5" />
                      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (redo()) {
                        const s = useMindMapStore.getState();
                        emitChange(s.nodes, s.edges);
                      }
                    }}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.08)",
                      background: "#ffffff",
                      cursor: canRedo ? "pointer" : "default",
                      opacity: canRedo ? 1 : 0.4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                      padding: 0,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1a1a1a"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 14 5-5-5-5" />
                      <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
                    </svg>
                  </button>
                </>
              )}
              {editable && (
                <button
                  onClick={resetAllPositions}
                  title="Перебудувати розкладку (Ctrl+Shift+0)"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: "#ffffff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    padding: 0,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1a1a1a"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.21 1.21 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72z" />
                    <path d="m14 7 3 3" />
                    <path d="M5 6v4" />
                    <path d="M19 14v4" />
                    <path d="M10 2v2" />
                    <path d="M7 8H3" />
                    <path d="M21 16h-4" />
                    <path d="M11 3H9" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setSearchOpen(true)}
                title="Пошук по нодах (Ctrl+Shift+F)"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "#ffffff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  padding: 0,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1a1a1a"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "#ffffff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  padding: 0,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1a1a1a"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {isFullscreen ? (
                    <>
                      <path d="M8 3v4a1 1 0 0 1-1 1H3" />
                      <path d="M16 3v4a1 1 0 0 0 1 1h4" />
                      <path d="M8 21v-4a1 1 0 0 0-1-1H3" />
                      <path d="M16 21v-4a1 1 0 0 1 1-1h4" />
                    </>
                  ) : (
                    <>
                      <path d="M3 8V3h5" />
                      <path d="M21 8V3h-5" />
                      <path d="M3 16v5h5" />
                      <path d="M21 16v5h-5" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </Panel>
        </ReactFlow>
        {!ready && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              fontSize: 12,
              color: "#888",
            }}
          >
            Laying out…
          </div>
        )}
        {deleteConfirm && (
          <DeleteConfirmDialog
            label={deleteConfirm.label}
            keepChildren={deleteConfirm.keepChildren}
            language={language}
            onConfirm={confirmDeleteNode}
            onCancel={cancelDeleteNode}
          />
        )}
      </div>
    </MindMapCtx.Provider>
  );
}

const RfMindMapForwarded = forwardRef(RfMindMapInner);

export const RfMindMap = forwardRef<RfMindMapHandle, RfMindMapProps>(
  function RfMindMap(props, ref) {
    return (
      <ReactFlowProvider>
        <RfMindMapForwarded {...props} ref={ref} />
      </ReactFlowProvider>
    );
  },
);
