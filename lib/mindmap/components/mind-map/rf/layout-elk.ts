import ELK from "elkjs/lib/elk.bundled.js";
import type { RfNode, RfEdge } from "./mindmap-to-rf";

const elk = new ELK();

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 44;
const TREE_GAP = 60; // vertical gap between independent trees

// Cyrillic glyphs and emoji render visually wider than the Latin average,
// so a `fontSize * 0.55` ratio under-estimates `charsPerLine`, ELK budgets
// 1-2 lines for what wraps to 5, and tall parents overlap their siblings.
// 0.62 is empirical — covers Cyrillic without bloating Latin-only labels.
const CHAR_WIDTH_RATIO = 0.62;
const NOTE_CHAR_WIDTH_RATIO = 0.55;

// ── Real text measurement ────────────────────────────────────────────────────
// Node sizes used to be guessed as `label.length * fontSize * ratio`. A
// character COUNT can't know that Cyrillic, emoji and the bundled fallback font
// render far wider than the Latin average the ratio was tuned for — so labels
// wrapped where the estimate said they wouldn't (text visibly clipped) and
// parents over-budgeted their rows (big empty gaps between branches). Measure
// the actual string with the same font stack the nodes render in.
const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
let measureCtx: CanvasRenderingContext2D | null | undefined;
const measureCache = new Map<string, number>();
function textWidthPx(text: string, fontSize: number, bold = false): number {
  if (!text) return 0;
  const key = `${bold ? "b" : "n"}${fontSize}|${text}`;
  const hit = measureCache.get(key);
  if (hit !== undefined) return hit;
  if (measureCtx === undefined) {
    try { measureCtx = document.createElement("canvas").getContext("2d"); } catch { measureCtx = null; }
  }
  const w = measureCtx
    ? (measureCtx.font = `${bold ? "700 " : ""}${fontSize}px ${FONT_STACK}`, measureCtx.measureText(text).width)
    : text.length * fontSize * CHAR_WIDTH_RATIO; // no canvas (SSR/tests) → old heuristic
  if (measureCache.size > 8000) measureCache.clear();
  measureCache.set(key, w);
  return w;
}
// Cap on extra lines added per `/` in a label. Pathological cases like
// `a/b/c/d/…` would otherwise inflate vertical budget unboundedly.
const MAX_FORCED_BREAKS = 4;

// Per-depth metrics — MindNode gives root and depth-1 more breathing room
// than deeper levels. Without this, one long child blows up its column and
// canvas sprawls horizontally.
const DEPTH_METRICS = [
  { maxWidth: 360, edgeSpacing: 44 },
  { maxWidth: 300, edgeSpacing: 28 },
] as const;
const DEFAULT_DEPTH_METRICS = { maxWidth: 240, edgeSpacing: 20 } as const;
const metricsFor = (depth: number) =>
  DEPTH_METRICS[depth] ?? DEFAULT_DEPTH_METRICS;

/**
 * Estimate node width from its text content when React Flow hasn't measured it yet.
 */
function estimateNodeWidth(n: RfNode): number {
  const raw = (n.data?.raw?.data as Record<string, unknown>) ?? {};
  const isRoot = n.data.depth === 0;
  const fontSize = (raw.fontSize as number) ?? (isRoot ? 17 : 14);
  const label = n.data.label || "";
  const NODE_MAX_WIDTH = metricsFor(n.data.depth).maxWidth;
  const userWidth = raw.userWidth as number | undefined;
  // User-set width is authoritative — render honors it without cap, so ELK
  // must too, else packing under-budgets and siblings overlap the resized node.
  if (typeof userWidth === "number") return userWidth;

  const hPad = isRoot ? 48 : 32;
  const icons = (raw.icon as string[] | undefined) ?? [];
  const tags = (raw.tag as string[] | undefined) ?? [];
  const extraW = icons.length * 20 + tags.length * 40;

  const textWidth = textWidthPx(label, fontSize, !!raw.bold) + hPad + extraW;
  // Cap at maxWidth — text wraps if it exceeds this
  return Math.max(60, Math.min(NODE_MAX_WIDTH, Math.ceil(textWidth)));
}

/**
 * Estimate node height from its content when React Flow hasn't measured it yet.
 * Accounts for font size, text wrapping at maxWidth, notes, and padding.
 */
function estimateNodeHeight(n: RfNode): number {
  const raw = (n.data?.raw?.data as Record<string, unknown>) ?? {};
  const isRoot = n.data.depth === 0;
  const fontSize = (raw.fontSize as number) ?? (isRoot ? 17 : 14);
  const label = n.data.label || "";
  const note = (raw.note as string) ?? "";

  const NODE_MAX_WIDTH = metricsFor(n.data.depth).maxWidth;
  // User-set width passes through as-is — render honors it verbatim (no cap),
  // so the height estimator must wrap text against the same width.
  const userWidth =
    typeof raw.userWidth === "number"
      ? (raw.userWidth as number)
      : undefined;
  // width available for text inside the node, in pixels
  const hPad = isRoot ? 48 : 32;
  const nodeWidth =
    userWidth ??
    Math.min(
      NODE_MAX_WIDTH,
      Math.max(60, Math.ceil(textWidthPx(label, fontSize, !!raw.bold) + hPad)),
    );
  const availPx = Math.max(20, nodeWidth - hPad);
  // Renderer wraps after `/`; each segment can also wrap internally if
  // it exceeds charsPerLine. Count both, capped to keep pathological
  // labels from inflating ELK's row budget.
  const segments = label.split("/");
  const cappedSegmentCount = Math.min(segments.length, MAX_FORCED_BREAKS + 1);
  let labelLines = 0;
  for (let i = 0; i < cappedSegmentCount; i++) {
    labelLines += Math.max(1, Math.ceil(textWidthPx(segments[i] || "", fontSize, !!raw.bold) / availPx));
  }
  labelLines = Math.max(1, labelLines);
  const lineHeight = fontSize * 1.4;
  let height = labelLines * lineHeight;

  if (note) {
    const noteFontSize = Math.max(10, fontSize - 3);
    const noteCharsPerLine = Math.max(
      1,
      Math.floor((nodeWidth - hPad) / (noteFontSize * NOTE_CHAR_WIDTH_RATIO)),
    );
    const noteLines = Math.max(1, Math.ceil(note.length / noteCharsPerLine));
    height += noteLines * (noteFontSize * 1.3) + 4;
  }

  // Padding (top + bottom)
  const vPad = isRoot ? 24 : 16;
  return Math.max(DEFAULT_NODE_HEIGHT, Math.ceil(height + vPad));
}

/**
 * Lay out one connected tree rooted at `rootId`.
 * Returns positioned nodes (only those in this subtree).
 */
async function layoutTree(
  treeNodes: RfNode[],
  treeEdges: RfEdge[],
  rootNode: RfNode,
): Promise<RfNode[]> {
  if (!treeNodes.length) return [];

  // Root anchor = auto-position the layout treats as "where the root would
  // be without any user offset". `node.position` is the DISPLAYED position
  // (which is auto + offset), so we subtract the root's own offset to get
  // the auto-anchor. Without this subtraction, every layout pass would
  // double-apply the offset (anchor drifts on each call).
  const rootRawDataForAnchor =
    (rootNode.data?.raw?.data as Record<string, unknown> | undefined) ?? {};
  const rootOffXForAnchor =
    typeof rootRawDataForAnchor.offsetX === "number"
      ? (rootRawDataForAnchor.offsetX as number)
      : 0;
  const rootOffYForAnchor =
    typeof rootRawDataForAnchor.offsetY === "number"
      ? (rootRawDataForAnchor.offsetY as number)
      : 0;
  const rootAnchor = {
    x: rootNode.position.x - rootOffXForAnchor,
    y: rootNode.position.y - rootOffYForAnchor,
  };

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "mrtree",
      "elk.direction": "RIGHT",
      // nodeNode = 12 absorbs 1-line height-estimate errors before they
      // become visible overlap. edgeNode tightened to 8 (was 12) — for
      // imported MindNode trees the original layout packs siblings much
      // closer than ELK's default reservation; 8 px gets us most of the
      // way without re-introducing the overlap that 6 caused on dense maps.
      "elk.spacing.nodeNode": "12",
      "elk.mrtree.spacing.nodeNode": "12",
      "elk.spacing.edgeNode": "8",
      "elk.mrtree.searchOrder": "DFS",
      "elk.padding": "[top=4,left=4,bottom=4,right=4]",
    },
    children: treeNodes.map((n) => {
      const measuredW = (n as any).width ?? n.measured?.width;
      const measuredH = (n as any).height ?? n.measured?.height;
      // Buffer-tier nodes have approve/reject buttons — add extra width for layout
      const tierExtra =
        (n.data?.raw?.data as Record<string, unknown>)?.tier === "buffer"
          ? 52
          : 0;
      // Use measured dimensions if available, otherwise estimate from content
      const width = measuredW ?? estimateNodeWidth(n);
      const height = measuredH ?? estimateNodeHeight(n);
      return {
        id: n.id,
        width: width + tierExtra,
        height,
      };
    }),
    edges: treeEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const res = await elk.layout(graph as any);
  const posById = new Map<string, { x: number; y: number }>();
  for (const c of res.children ?? []) {
    posById.set(c.id!, { x: c.x ?? 0, y: c.y ?? 0 });
  }

  // Cascading-delta positioning. ELK lays out the whole tree in its own
  // coordinate system starting at (0,0). We override the position of every
  // pinned node to its `customLeft/customTop`, and the non-pinned children
  // of a pinned ancestor must follow that ancestor's offset — otherwise
  // they stay at ELK's absolute coords and the edge from the pinned parent
  // stretches across the canvas ("long L-shape" bug).
  //
  // BFS from root, carrying a (dx, dy) delta. At each pinned node we reset
  // the delta to (pinnedPos - elkPos) so its subtree is anchored at the
  // pinned spot. For non-pinned nodes we just apply the inherited delta.
  const pinnedOf = (n: RfNode): { x: number; y: number } | null => {
    const raw =
      (n.data?.raw?.data as Record<string, unknown> | undefined) ?? {};
    if (
      typeof raw.customLeft === "number" &&
      typeof raw.customTop === "number"
    ) {
      return { x: raw.customLeft as number, y: raw.customTop as number };
    }
    // MindNode-imported "Personal Touch" absolute canvas coords. Treated as
    // a legacy-style pin: the node sits at its authored position and its
    // descendants follow via the cascading delta. Cleared automatically on
    // user drag-stop (the editor writes offsetX/offsetY, but we still keep
    // mindnodeAbsX/Y as a fallback for re-runs of the layout). When both are
    // present the user's drag-offset wins, since offsetOf() applies on top
    // of an unpinned ELK position — see below.
    if (
      typeof raw.mindnodeAbsX === "number" &&
      typeof raw.mindnodeAbsY === "number" &&
      typeof raw.offsetX !== "number" &&
      typeof raw.offsetY !== "number"
    ) {
      return {
        x: raw.mindnodeAbsX as number,
        y: raw.mindnodeAbsY as number,
      };
    }
    return null;
  };
  // Returns delta-model offset (MindNode "Personal Touch") if any.
  // Distinct from pinnedOf which reads the legacy absolute customLeft/Top.
  // BOTH must be cascaded down the subtree so that descendants of a
  // displaced parent follow the parent — otherwise children stay anchored
  // to ELK's auto-Y while the parent shifts off, which is the
  // "children-don't-follow" bug.
  const offsetOf = (n: RfNode): { x: number; y: number } => {
    const raw =
      (n.data?.raw?.data as Record<string, unknown> | undefined) ?? {};
    return {
      x: typeof raw.offsetX === "number" ? (raw.offsetX as number) : 0,
      y: typeof raw.offsetY === "number" ? (raw.offsetY as number) : 0,
    };
  };
  const nodesById = new Map(treeNodes.map((n) => [n.id, n]));
  const childrenById = new Map<string, string[]>();
  for (const e of treeEdges) {
    const arr = childrenById.get(e.source) ?? [];
    arr.push(e.target);
    childrenById.set(e.source, arr);
  }

  const absPos = new Map<string, { x: number; y: number }>();
  // Auto position = where the node WOULD be without its OWN personal-touch
  // offset/pin. Used by anti-overlap to reserve a SLOT for displaced nodes,
  // matching MindNode behaviour: pinned nodes leave a visible gap in the
  // sibling column at their slot position (the "phantom slot"). Without
  // this, `subtreeExtent` would return null for pinned nodes and the
  // column would compress around them — wrong.
  const autoAbsPos = new Map<string, { x: number; y: number }>();
  const rootPinned = pinnedOf(rootNode);
  const rootElkPos = posById.get(rootNode.id);
  const rootAbs = rootPinned ?? rootAnchor;
  // Cascading delta passed to descendants. Includes root's own
  // personal-touch offset so dragging the root drags the whole subtree
  // along — without these +rootOff terms the bug below shows up:
  //
  //   X follows fine because the second BFS (childX = parentPos.x +
  //   parentW + …) rebakes children from `posMap[root]`, which already
  //   has root's offset added separately. But Y is never rebaked from
  //   the parent — children's Y comes straight from absPos. So a root
  //   dragged DOWN strands kids at the original Y, edges visibly
  //   stretching across the canvas.
  //
  // Adding rootOff to rootDelta here mirrors how non-root offsets are
  // cascaded a few lines down (`nextDelta = delta + kidOff`). The
  // root's OWN absPos is set from rootAbs (no offset), so its slot
  // reservation logic and the later `posMap[root].x += rootOff` step
  // both stay correct — only the kids see the +offset cascade.
  const rootDelta = rootElkPos
    ? {
        x: rootAbs.x - rootElkPos.x + rootOffXForAnchor,
        y: rootAbs.y - rootElkPos.y + rootOffYForAnchor,
      }
    : { x: 0, y: 0 };
  absPos.set(rootNode.id, rootAbs);
  // Root's auto-pos is its ELK position (in tree-local coords) anchored
  // at rootAnchor — i.e., the displayed pos minus root's own pin offset.
  // For root we don't usually care; included for completeness.
  autoAbsPos.set(
    rootNode.id,
    rootElkPos ? { x: rootAnchor.x, y: rootAnchor.y } : rootAbs,
  );

  // Index-based BFS: array.shift() is O(n), which made this loop O(n²) on
  // large maps.
  const posQueue: Array<{ id: string; delta: { x: number; y: number } }> = [
    { id: rootNode.id, delta: rootDelta },
  ];
  for (let pqi = 0; pqi < posQueue.length; pqi++) {
    const { id, delta } = posQueue[pqi];
    for (const kidId of childrenById.get(id) ?? []) {
      const kidNode = nodesById.get(kidId);
      if (!kidNode) continue;
      const kidPinned = pinnedOf(kidNode);
      const kidElk = posById.get(kidId);
      if (kidPinned) {
        absPos.set(kidId, kidPinned);
        // Auto slot = where ELK placed it within ancestor delta. For
        // legacy customLeft/Top (absolute pin) the auto slot is still
        // where ELK would put it.
        if (kidElk) {
          autoAbsPos.set(kidId, {
            x: kidElk.x + delta.x,
            y: kidElk.y + delta.y,
          });
        }
        const nextDelta = kidElk
          ? { x: kidPinned.x - kidElk.x, y: kidPinned.y - kidElk.y }
          : delta;
        posQueue.push({ id: kidId, delta: nextDelta });
      } else if (kidElk) {
        // Cascade parent's delta + add kid's own offset (delta model).
        // The cumulative delta passed to grandchildren includes kid's
        // offset so the entire subtree follows the displaced kid.
        const kidOff = offsetOf(kidNode);
        absPos.set(kidId, {
          x: kidElk.x + delta.x + kidOff.x,
          y: kidElk.y + delta.y + kidOff.y,
        });
        // Auto slot = ELK + ancestor delta, WITHOUT kid's own offset.
        // For unpinned kids this equals absPos (offset = 0). For
        // offset-pinned kids this is the slot they occupy in the
        // sibling column — used to reserve the "phantom slot" gap.
        autoAbsPos.set(kidId, {
          x: kidElk.x + delta.x,
          y: kidElk.y + delta.y,
        });
        const nextDelta =
          kidOff.x !== 0 || kidOff.y !== 0
            ? { x: delta.x + kidOff.x, y: delta.y + kidOff.y }
            : delta;
        posQueue.push({ id: kidId, delta: nextDelta });
      }
    }
  }

  // ── Bottom-align line-shape chains ────────────────────────────────
  // For "line" topics the visible feature is the underline at the node's
  // bottom Y. A chain of line-shape topics — whether arranged as siblings
  // ("Категории" / "Бэк-Лог" / "Задачи" all under one parent) or as a
  // parent-child cascade ("Категории" → "Бэк-Лог" → "Задачи") — should
  // visually share ONE horizontal rule.
  //
  // Walk the graph and group every connected line-shape neighbourhood
  // (siblings AND parents/children that are both line-shape). For each
  // group find the deepest bottom-Y and shift the rest DOWN so all
  // bottoms match. The renderer paints text at the top of the node, so
  // shorter members of the group leave a small empty gap above their
  // text — but their underlines line up with the chain's deepest edge.
  const heightById = new Map<string, number>();
  for (const n of treeNodes) {
    const measured = (n as any).height ?? n.measured?.height;
    heightById.set(n.id, measured ?? estimateNodeHeight(n));
  }
  const isLineShape = (n: RfNode | undefined): boolean =>
    (n?.data?.raw?.data as Record<string, unknown> | undefined)?.shape ===
    "line";

  // Build undirected adjacency restricted to line-shape nodes (both
  // sibling and parent-child neighbours qualify).
  const lineNeighbours = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!lineNeighbours.has(a)) lineNeighbours.set(a, new Set());
    if (!lineNeighbours.has(b)) lineNeighbours.set(b, new Set());
    lineNeighbours.get(a)!.add(b);
    lineNeighbours.get(b)!.add(a);
  };
  for (const e of treeEdges) {
    if (
      isLineShape(nodesById.get(e.source)) &&
      isLineShape(nodesById.get(e.target))
    ) {
      addEdge(e.source, e.target);
    }
  }
  for (const [parentId, kids] of childrenById) {
    const lineKids = kids.filter((id) => isLineShape(nodesById.get(id)));
    for (let i = 0; i < lineKids.length; i++) {
      for (let j = i + 1; j < lineKids.length; j++) {
        addEdge(lineKids[i], lineKids[j]);
      }
    }
  }

  // Collect connected components and snap each to a shared bottom Y.
  const visited = new Set<string>();
  for (const startId of lineNeighbours.keys()) {
    if (visited.has(startId)) continue;
    const componentIds: string[] = [];
    const stack = [startId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      componentIds.push(cur);
      for (const nb of lineNeighbours.get(cur) ?? []) {
        if (!visited.has(nb)) stack.push(nb);
      }
    }
    if (componentIds.length < 2) continue;
    let maxBottom = -Infinity;
    for (const id of componentIds) {
      const p = absPos.get(id);
      const h = heightById.get(id) ?? 0;
      if (p) maxBottom = Math.max(maxBottom, p.y + h);
    }
    if (!Number.isFinite(maxBottom)) continue;
    for (const id of componentIds) {
      const p = absPos.get(id);
      const h = heightById.get(id) ?? 0;
      if (p) p.y = maxBottom - h;
    }
  }

  const positioned = treeNodes.map((n) => {
    const pos = absPos.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });

  // ELK mrtree centers nodes by midpoint within each level. For a mind map
  // we want LEFT-ALIGNMENT (children share parent's right edge as baseline)
  // so wider nodes extend right, not shift left. mrtree has no per-edge
  // spacing knob — depth-aware gap comes from `metricsFor(depth)`.
  const posMap = new Map(positioned.map((n) => [n.id, { ...n.position }]));
  // Use the same widths that were passed to ELK for consistency
  const elkWidthById = new Map<string, number>();
  for (const c of graph.children) {
    elkWidthById.set(c.id, c.width);
  }
  const widthMap = new Map(
    treeNodes.map((n) => [
      n.id,
      elkWidthById.get(n.id) ??
        (n as any).width ??
        n.measured?.width ??
        DEFAULT_NODE_WIDTH,
    ]),
  );
  // parent → children
  const childrenByParent = new Map<string, string[]>();
  for (const e of treeEdges) {
    const arr = childrenByParent.get(e.source) ?? [];
    arr.push(e.target);
    childrenByParent.set(e.source, arr);
  }

  // BFS from root: fix X for each group of children, then apply per-node
  // `offsetX / offsetY` (MindNode "Personal Touch" / Flexible Layout model:
  // display = autoPos + offset). Offset is a DELTA from the auto-computed
  // slot — when the parent moves, the auto slot moves with it, and the
  // offset is reapplied on top. `customLeft / customTop` is the older
  // ABSOLUTE pin model and is kept for back-compat; offset takes precedence
  // when both are present on the same node.
  const rootRaw = rootNode.data.raw.data as Record<string, unknown> | undefined;
  const rootOffX =
    typeof rootRaw?.offsetX === "number" ? (rootRaw.offsetX as number) : 0;
  const rootOffY =
    typeof rootRaw?.offsetY === "number" ? (rootRaw.offsetY as number) : 0;
  if (rootOffX !== 0 || rootOffY !== 0) {
    const p = posMap.get(rootNode.id);
    const rootHasCustom =
      typeof rootRaw?.customLeft === "number" &&
      typeof rootRaw?.customTop === "number";
    if (p && !rootHasCustom) {
      p.x += rootOffX;
      p.y += rootOffY;
    }
  }

  // O(1) raw-data lookup — the old `treeNodes.find(...)` per child made
  // this BFS O(n²) and was a major source of lag on 500+ node maps.
  const rawById = new Map<string, Record<string, unknown>>();
  for (const n of treeNodes) {
    rawById.set(n.id, (n.data.raw.data ?? {}) as Record<string, unknown>);
  }

  // Index-based BFS — `queue.shift()` is O(n) on JS arrays, so the old
  // loop was O(n²). Using a head index keeps it O(n).
  const queue: string[] = [rootNode.id];
  for (let qi = 0; qi < queue.length; qi++) {
    const parentId = queue[qi];
    const children = childrenByParent.get(parentId);
    if (!children?.length) continue;
    const parentPos = posMap.get(parentId);
    const parentW = widthMap.get(parentId) ?? DEFAULT_NODE_WIDTH;
    const parentNode = nodesById.get(parentId);
    if (parentPos) {
      const parentDepth = parentNode?.data.depth ?? 0;
      const childX =
        parentPos.x + parentW + metricsFor(parentDepth).edgeSpacing;
      for (const cid of children) {
        const cPos = posMap.get(cid);
        const cRaw = rawById.get(cid) ?? {};
        const cHasCustom =
          typeof cRaw.customLeft === "number" &&
          typeof cRaw.customTop === "number";
        const cOffX =
          typeof cRaw.offsetX === "number" ? (cRaw.offsetX as number) : 0;
        if (cPos && !cHasCustom) {
          // Left-align children under parent. parentPos already includes
          // parent's offset (cascaded by first BFS), so this naturally
          // moves children with parent on X. cOffX is child's own
          // offset on top.
          //
          // Y is intentionally NOT touched here. First BFS now cascades
          // BOTH parent's delta and kid's own offset into absPos, so cPos.y
          // is already final. Adding cOffY here would double-count it
          // (the children-don't-follow Y bug came from the inverse
          // version: first BFS missed the offset, so this line tried to
          // patch it but only added the CHILD's own offset, not the
          // ancestor chain's).
          cPos.x = childX + cOffX;
        }
        queue.push(cid);
      }
    } else {
      for (const cid of children) queue.push(cid);
    }
  }

  // ── Subtree anti-overlap pass (bottom-up) ───────────────────────────
  // Process deepest levels first so inner subtrees are resolved before
  // computing outer subtree extents. For each parent, ensure consecutive
  // siblings' subtree bounding boxes don't overlap vertically.
  const heightMap = new Map<string, number>();
  for (const c of graph.children) {
    heightMap.set(c.id, c.height);
  }
  // Min Y-gap between sibling subtree bboxes. 12 px ≈ one line of slack
  // for height-estimate errors when nodes weren't measured by RF.
  const MIN_GAP = 12;

  // Set of pinned node IDs — they anchor the layout; anti-overlap shifts
  // their neighbours instead of moving them. A node counts as pinned if
  // EITHER the legacy absolute `customLeft/customTop` is set, OR the new
  // relative `offsetX/offsetY` is non-zero.
  const customPosIds = new Set<string>();
  for (const n of treeNodes) {
    const raw = n.data.raw.data ?? {};
    const hasCustom =
      typeof raw.customLeft === "number" && typeof raw.customTop === "number";
    const hasOffset =
      (typeof raw.offsetX === "number" && raw.offsetX !== 0) ||
      (typeof raw.offsetY === "number" && raw.offsetY !== 0);
    if (hasCustom || hasOffset) {
      customPosIds.add(n.id);
    }
  }

  /**
   * Parent-pointer map used for cache invalidation: when a subtree at
   * `nodeId` shifts, every ANCESTOR's cached extent is stale. Building it
   * once is O(n); invalidation then walks only the spine up to the root.
   */
  const parentOf = new Map<string, string>();
  for (const [p, kids] of childrenByParent) {
    for (const k of kids) parentOf.set(k, p);
  }

  /**
   * Memoized subtree extent. Without the cache each all-pairs scan is
   * O(n²) calls × O(n) descendants = O(n³) and large maps visibly lag
   * on expand. We clear only the dirty spine on shift instead of the
   * whole cache, so amortized cost stays near O(n log n).
   */
  const extentCache = new Map<string, [number, number]>();

  function invalidateExtentUp(nodeId: string) {
    let cur: string | undefined = nodeId;
    while (cur !== undefined) {
      if (!extentCache.has(cur)) break; // nothing above was ever cached
      extentCache.delete(cur);
      cur = parentOf.get(cur);
    }
  }

  /**
   * Shift a node and its subtree by dy.
   *
   * Three cases by pin model:
   * 1. Absolute pin (customLeft/Top): displayed position is anchored in
   *    canvas coords, do NOT shift posMap. Shift only autoAbsPos so the
   *    slot reservation in the sibling column tracks layout shifts.
   *    Don't recurse — descendants of an absolute pin are anchored to
   *    that pin and stay put.
   * 2. Offset pin (offsetX/Y, MindNode "Personal Touch"): displayed =
   *    slot + offset. Shifting the slot must also shift the displayed
   *    position to preserve the offset. Recurse into descendants — they
   *    follow via offset cascade.
   * 3. Unpinned: shift both maps (autoAbsPos == posMap for these) and
   *    recurse normally.
   */
  function shiftSubtree(nodeId: string, dy: number) {
    const node = nodesById.get(nodeId);
    const raw =
      (node?.data?.raw?.data as Record<string, unknown> | undefined) ?? {};
    const hasAbsolute =
      typeof raw.customLeft === "number" && typeof raw.customTop === "number";

    if (hasAbsolute) {
      const auto = autoAbsPos.get(nodeId);
      if (auto) auto.y += dy;
      extentCache.delete(nodeId);
      invalidateExtentUp(nodeId);
      return;
    }

    const pos = posMap.get(nodeId);
    if (pos) pos.y += dy;
    const auto = autoAbsPos.get(nodeId);
    if (auto) auto.y += dy;
    const kids = childrenByParent.get(nodeId);
    if (kids) {
      for (const kid of kids) shiftSubtree(kid, dy);
    }
    // Only the ancestor chain needs invalidation — this node and its
    // descendants all moved by the same dy, so their RELATIVE extents
    // are unchanged. But `extentCache` stores ABSOLUTE [minY, maxY],
    // so every cached extent touching this subtree is stale.
    invalidateExtentUp(nodeId);
    // Also clear cached entries for the moved subtree itself.
    const stack = [nodeId];
    while (stack.length) {
      const cur = stack.pop()!;
      extentCache.delete(cur);
      const sub = childrenByParent.get(cur);
      if (sub) stack.push(...sub);
    }
  }

  /**
   * Memoized Y extent [minY, maxY] of a node and all its descendants.
   *
   * MindNode behaviour: a personal-touch–displaced node RESERVES its slot
   * in the sibling column. Other siblings pack around the slot as if the
   * displaced node were still there — leaving a visible gap (the
   * "phantom slot") at the displaced node's home, so the user can still
   * see where it logically belongs in the sibling order.
   *
   * For pinned nodes we return only THEIR own auto-slot height (no
   * descendant recursion): descendants follow the offset-cascade and live
   * far away at displaced positions; they don't belong to this column.
   */
  function subtreeExtent(nodeId: string): [number, number] | null {
    const cached = extentCache.get(nodeId);
    if (cached) return cached;
    // Pinned node — return its slot extent at AUTO Y (where it would
    // sit without personal-touch offset). The column reserves this slot
    // as a visible gap.
    if (customPosIds.has(nodeId)) {
      const auto = autoAbsPos.get(nodeId);
      const h = heightMap.get(nodeId) ?? DEFAULT_NODE_HEIGHT;
      if (auto) {
        const out: [number, number] = [auto.y, auto.y + h];
        extentCache.set(nodeId, out);
        return out;
      }
      // No auto pos (rare — pinned root with no ELK output) → ignore.
      extentCache.set(nodeId, null as unknown as [number, number]);
      return null;
    }
    const pos = posMap.get(nodeId);
    if (!pos) {
      const zero: [number, number] = [0, 0];
      extentCache.set(nodeId, zero);
      return zero;
    }
    const h = heightMap.get(nodeId) ?? DEFAULT_NODE_HEIGHT;
    let minY = pos.y;
    let maxY = pos.y + h;
    const kids = childrenByParent.get(nodeId);
    if (kids) {
      for (const kid of kids) {
        const childExtent = subtreeExtent(kid);
        if (!childExtent) continue;
        const [cMin, cMax] = childExtent;
        if (cMin < minY) minY = cMin;
        if (cMax > maxY) maxY = cMax;
      }
    }
    const out: [number, number] = [minY, maxY];
    extentCache.set(nodeId, out);
    return out;
  }

  // Collect all parents sorted by depth (deepest first = bottom-up)
  const depthOf = new Map<string, number>();
  for (const n of treeNodes) depthOf.set(n.id, n.data.depth);
  const parentsWithChildren: string[] = [];
  for (const [parentId, kids] of childrenByParent) {
    if (kids.length >= 2) parentsWithChildren.push(parentId);
  }
  parentsWithChildren.sort(
    (a, b) => (depthOf.get(b) ?? 0) - (depthOf.get(a) ?? 0),
  );

  // Multiple passes: fixing one level may cause overlap at a higher level.
  // With memoized extent + early-exit, passes are cheap; 5 is plenty for
  // cascading fixes on real maps.
  for (let pass = 0; pass < 5; pass++) {
    let shifted = false;
    for (const parentId of parentsWithChildren) {
      const siblings = childrenByParent.get(parentId)!;
      for (let i = 1; i < siblings.length; i++) {
        // Pinned siblings RESERVE their slot in the column (MindNode
        // "phantom slot" behaviour). subtreeExtent returns their auto
        // slot height, not null, so they participate in overlap detection
        // — but shiftSubtree handles them specially: absolute pins don't
        // move displayed pos, offset pins move with slot.
        const prevExt = subtreeExtent(siblings[i - 1]);
        const currExt = subtreeExtent(siblings[i]);
        if (!prevExt || !currExt) continue;
        const overlap = prevExt[1] + MIN_GAP - currExt[0];
        if (overlap <= 0) continue;

        // Push current and later siblings DOWN to clear the overlap.
        for (let j = i; j < siblings.length; j++) {
          shiftSubtree(siblings[j], overlap);
        }
        shifted = true;
      }
    }
    if (!shifted) break;
  }

  // All-pairs safety pass: consecutive-only scan above can leave transitive
  // overlaps between non-neighbour siblings. Pinned siblings now
  // participate (their slot extent is reserved); shiftSubtree handles
  // their pin model correctly.
  for (let pass = 0; pass < 3; pass++) {
    let shifted = false;
    for (const parentId of parentsWithChildren) {
      const siblings = childrenByParent.get(parentId)!;
      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const extA = subtreeExtent(siblings[i]);
          const extB = subtreeExtent(siblings[j]);
          if (!extA || !extB) continue;
          const aAbove = extA[0] <= extB[0];
          const upperMax = aAbove ? extA[1] : extB[1];
          const lowerMin = aAbove ? extB[0] : extA[0];
          const overlap = upperMax + MIN_GAP - lowerMin;
          if (overlap <= 0) continue;

          const lowerId = aAbove ? siblings[j] : siblings[i];
          shiftSubtree(lowerId, overlap);
          shifted = true;
        }
      }
    }
    if (!shifted) break;
  }

  // ── Cross-tree pairwise anti-overlap ─────────────────────────────────
  // Sibling-only passes above can leave a pinned node from one branch
  // sitting inside another branch's column. Bucket nodes by their X-band
  // (~one column wide) so we only compare nodes that actually share a
  // column — drops the pass from O(n²) to O(c·k²) where c is column count.
  // Within a bucket: shift the lower node down, but if it's absolute-pinned
  // shift the upper node further down instead (push-down on both sides
  // avoids the oscillation we'd get from moving an upper node UP into a
  // new collision).
  const isAbsPin = (id: string): boolean => {
    const raw =
      (nodesById.get(id)?.data?.raw?.data as
        | Record<string, unknown>
        | undefined) ?? {};
    return (
      typeof raw.customLeft === "number" && typeof raw.customTop === "number"
    );
  };
  const COL_BAND = 80; // typical inter-column gap; tune if layouts get tighter
  const buckets = new Map<number, string[]>();
  for (const [id, pos] of posMap) {
    // Bucket by FULL X-extent (left..right), not just left edge: a wide
    // pinned node like "Ai СФЕРА. Анализ и Внедрение Ai" (~250 px) whose
    // left edge sits in bucket K has its right edge in bucket K+3, and
    // the old [K-1, K, K+1] range left a non-pinned neighbour at the
    // pin's right side outside any shared bucket → cross-tree overlap
    // missed at import time.
    const w = widthMap.get(id) ?? DEFAULT_NODE_WIDTH;
    const leftK = Math.floor(pos.x / COL_BAND);
    const rightK = Math.floor((pos.x + w) / COL_BAND);
    for (let k = leftK - 1; k <= rightK + 1; k++) {
      const arr = buckets.get(k);
      if (arr) arr.push(id);
      else buckets.set(k, [id]);
    }
  }
  // For pin-vs-anything we treat a near-miss in X (gap < 25 px) as a
  // collision worth resolving. A pinned node placed by the user inside
  // another tree's column often lands with only a few pixels of clear
  // space — bbox-strict checks ignore it but the rendered labels read as
  // overlapping (especially with edge-line corridors crossing through).
  const PIN_NEAR_MISS_GAP = 25;
  for (let pass = 0; pass < 6; pass++) {
    let shifted = false;
    for (const ids of buckets.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const idA = ids[i];
          const idB = ids[j];
          const posA = posMap.get(idA);
          const posB = posMap.get(idB);
          if (!posA || !posB) continue;
          const wA = widthMap.get(idA) ?? DEFAULT_NODE_WIDTH;
          const wB = widthMap.get(idB) ?? DEFAULT_NODE_WIDTH;
          const hA = heightMap.get(idA) ?? DEFAULT_NODE_HEIGHT;
          const hB = heightMap.get(idB) ?? DEFAULT_NODE_HEIGHT;
          const ox =
            Math.min(posA.x + wA, posB.x + wB) - Math.max(posA.x, posB.x);
          const eitherPinned = isAbsPin(idA) || isAbsPin(idB);
          // Threshold: 4 px of overlap normally; for pin-vs-anything,
          // require a 25 px clear gap (treat ox > -25 as "too close").
          const oxThreshold = eitherPinned ? -PIN_NEAR_MISS_GAP : 4;
          if (ox < oxThreshold) continue;
          const oy =
            Math.min(posA.y + hA, posB.y + hB) - Math.max(posA.y, posB.y);
          if (oy <= 0) continue;
          const aIsAbove = posA.y <= posB.y;
          const upperBottom = aIsAbove ? posA.y + hA : posB.y + hB;
          const lowerId = aIsAbove ? idB : idA;
          const lowerPos = aIsAbove ? posB : posA;
          const upperId = aIsAbove ? idA : idB;
          const dy = upperBottom + MIN_GAP - lowerPos.y;
          if (dy <= 0) continue;
          if (!isAbsPin(lowerId)) {
            shiftSubtree(lowerId, dy);
            shifted = true;
          } else if (!isAbsPin(upperId)) {
            const lowerH = heightMap.get(lowerId) ?? DEFAULT_NODE_HEIGHT;
            const downDy =
              lowerPos.y + lowerH + MIN_GAP - posMap.get(upperId)!.y;
            if (downDy > 0) {
              shiftSubtree(upperId, downDy);
              shifted = true;
            }
          }
          // Both pinned → user placed both; leave them.
        }
      }
    }
    if (!shifted) break;
  }

  // ── One-shot pinned-sibling Y-uniqueness ──────────────────────────────
  // After all bbox-based passes, two absolute-pinned siblings can still
  // share an overlapping Y-band even though their X columns differ — e.g.
  // ТМ чаты at customTop=-184 and Ai СФЕРА at customTop=-168 (both
  // children of the same parent). Their bboxes don't intersect (X gap),
  // but the parent's `step`-edge to the further-right pin draws a
  // horizontal segment AT that pin's Y, which slices through the nearer
  // pin's bbox visually and reads as overlap.
  //
  // Single non-iterative sweep per parent group:
  //   1. Sort the parent's pinned siblings by displayed Y (ascending).
  //   2. Walk the list; if pin[i+1].topY < pin[i].bottomY + MIN_GAP, push
  //      pin[i+1] (and its descendants) DOWN visually so the bands stop
  //      touching. Update its Y for the next comparison.
  //
  // Visual-only: posMap shifts, `data.raw.data.customTop` is preserved
  // (round-trips to file unchanged). No iteration loop → no cascade risk.
  // Cost: O(g · k log k) where g = #parents-with-multiple-pins, k = #pins
  // in that group. Negligible for any realistic map.
  const pinnedByParent = new Map<string, string[]>();
  for (const n of treeNodes) {
    const raw = (n.data?.raw?.data as Record<string, unknown> | undefined) ?? {};
    if (
      typeof raw.customLeft === "number" &&
      typeof raw.customTop === "number"
    ) {
      const p = parentOf.get(n.id);
      if (!p) continue;
      const arr = pinnedByParent.get(p) ?? [];
      arr.push(n.id);
      pinnedByParent.set(p, arr);
    }
  }
  for (const [, group] of pinnedByParent) {
    if (group.length < 2) continue;
    // Sort by current displayed Y
    group.sort((a, b) => (posMap.get(a)?.y ?? 0) - (posMap.get(b)?.y ?? 0));
    for (let i = 1; i < group.length; i++) {
      const prevId = group[i - 1];
      const curId = group[i];
      const prevPos = posMap.get(prevId);
      const curPos = posMap.get(curId);
      if (!prevPos || !curPos) continue;
      const prevH = heightMap.get(prevId) ?? DEFAULT_NODE_HEIGHT;
      const prevBottom = prevPos.y + prevH;
      const dy = prevBottom + MIN_GAP - curPos.y;
      if (dy <= 0) continue;
      // Visually shift current pin and its descendants — preserve their
      // customTop in data; only posMap (displayed) changes.
      const stack = [curId];
      while (stack.length) {
        const id = stack.pop()!;
        const p = posMap.get(id);
        if (p) p.y += dy;
        const kids = childrenByParent.get(id);
        if (kids) for (const k of kids) stack.push(k);
      }
    }
  }

  return positioned.map((n) => {
    const fixed = posMap.get(n.id);
    if (!fixed) return n;
    return { ...n, position: fixed };
  });
}

/**
 * Layout all trees. Each depth-0 node is a separate tree root.
 * Trees are stacked vertically with TREE_GAP between them.
 */
export async function layoutElk(
  nodes: RfNode[],
  edges: RfEdge[],
): Promise<{ nodes: RfNode[]; edges: RfEdge[] }> {
  if (!nodes.length) return { nodes, edges };

  const roots = nodes.filter((n) => n.data.depth === 0);
  if (!roots.length) return { nodes, edges };

  // Single root — fast path (no need to split/merge)
  if (roots.length === 1) {
    const laid = await layoutTree(nodes, edges, roots[0]);
    return { nodes: laid, edges };
  }

  // Multiple roots — layout each tree independently, stack vertically
  // Build set of node IDs per tree
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childrenOf.get(e.source) ?? [];
    arr.push(e.target);
    childrenOf.set(e.source, arr);
  }

  function subtreeIds(rootId: string): Set<string> {
    const out = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      out.add(id);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
    return out;
  }

  const laidAll: RfNode[] = [];
  let yOffset = 0;
  // Check if any root has custom position — if so, don't auto-stack
  const anyCustom = roots.some((r) => {
    const raw = r.data.raw.data ?? {};
    return (
      typeof raw.customLeft === "number" && typeof raw.customTop === "number"
    );
  });

  for (const root of roots) {
    const ids = subtreeIds(root.id);
    const treeNodes = nodes.filter((n) => ids.has(n.id));
    const treeEdges = edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );

    // If no custom positions, offset each tree's root Y so trees stack
    if (!anyCustom && yOffset > 0) {
      const shifted = treeNodes.map((n) =>
        n.id === root.id
          ? { ...n, position: { ...n.position, y: yOffset } }
          : n,
      );
      const laid = await layoutTree(shifted, treeEdges, {
        ...root,
        position: { ...root.position, y: yOffset },
      });
      // Compute bounding box of this tree for next offset
      let maxY = 0;
      for (const n of laid) {
        const h = (n as any).height ?? DEFAULT_NODE_HEIGHT;
        const bottom = n.position.y + h;
        if (bottom > maxY) maxY = bottom;
      }
      yOffset = maxY + TREE_GAP;
      laidAll.push(...laid);
    } else {
      const laid = await layoutTree(treeNodes, treeEdges, root);
      let maxY = 0;
      for (const n of laid) {
        const h = (n as any).height ?? DEFAULT_NODE_HEIGHT;
        const bottom = n.position.y + h;
        if (bottom > maxY) maxY = bottom;
      }
      yOffset = maxY + TREE_GAP;
      laidAll.push(...laid);
    }
  }

  return { nodes: laidAll, edges };
}
