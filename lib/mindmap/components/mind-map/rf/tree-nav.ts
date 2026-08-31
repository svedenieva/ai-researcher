import type { RfNode, RfEdge } from "./mindmap-to-rf";

export function buildMaps(nodes: RfNode[], edges: RfEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  for (const e of edges) {
    const arr = children.get(e.source) ?? [];
    arr.push(e.target);
    children.set(e.source, arr);
    parent.set(e.target, e.source);
  }
  return { byId, children, parent };
}

export function navigate(
  nodes: RfNode[],
  edges: RfEdge[],
  currentId: string,
  dir: "up" | "down" | "left" | "right",
): string | null {
  const { children, parent } = buildMaps(nodes, edges);

  if (dir === "right") {
    const kids = children.get(currentId);
    return kids && kids.length ? kids[0] : null;
  }
  if (dir === "left") {
    return parent.get(currentId) ?? null;
  }
  const parentId = parent.get(currentId);
  if (!parentId) return null;
  const sibs = children.get(parentId) ?? [];
  const idx = sibs.indexOf(currentId);
  if (idx < 0) return null;
  if (dir === "up") return sibs[idx - 1] ?? null;
  if (dir === "down") return sibs[idx + 1] ?? null;
  return null;
}

/**
 * Walk up from `id` and set `data.raw.data.expand = true` on every ancestor
 * that has it explicitly set to false. Returns a new nodes array if anything
 * changed, else the same reference so callers can short-circuit.
 */
export function expandAncestors(
  nodes: RfNode[],
  edges: RfEdge[],
  id: string,
): RfNode[] {
  const parentOf = new Map<string, string>();
  for (const e of edges) parentOf.set(e.target, e.source);

  const toExpand = new Set<string>();
  let cur = parentOf.get(id);
  while (cur) {
    toExpand.add(cur);
    cur = parentOf.get(cur);
  }
  if (!toExpand.size) return nodes;

  let changed = false;
  const out = nodes.map((n) => {
    if (!toExpand.has(n.id)) return n;
    const raw = n.data.raw.data ?? {};
    if (raw.expand !== false) return n;
    changed = true;
    return {
      ...n,
      data: {
        ...n.data,
        raw: { ...n.data.raw, data: { ...raw, expand: true } },
      },
    };
  });
  return changed ? out : nodes;
}

export function toggleExpand(nodes: RfNode[], id: string): RfNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const raw = n.data.raw.data ?? {};
    const cur = raw.expand !== false;
    return {
      ...n,
      data: {
        ...n.data,
        raw: { ...n.data.raw, data: { ...raw, expand: !cur } },
      },
    };
  });
}

function descendantsOf(
  children: Map<string, string[]>,
  rootId: string,
): Set<string> {
  const out = new Set<string>();
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    for (const c of children.get(id) ?? []) stack.push(c);
  }
  return out;
}

/**
 * Expand/collapse entire tree to a specific depth level.
 * level=0 → only root visible (all depth>=0 nodes with children collapsed)
 * level=1 → root + direct children visible
 * level=N → nodes at depth < N expanded, nodes at depth >= N collapsed
 */
export function expandToLevel(
  nodes: RfNode[],
  edges: RfEdge[],
  level: number,
): RfNode[] {
  return nodes.map((n) => {
    const depth = n.data.depth as number;
    const raw = n.data.raw.data ?? {};
    const hasKids = n.data.hasChildren;
    if (!hasKids) return n;
    const shouldExpand = depth < level;
    if ((raw.expand !== false) === shouldExpand) return n;
    return {
      ...n,
      data: {
        ...n.data,
        raw: { ...n.data.raw, data: { ...raw, expand: shouldExpand ? undefined : false } },
      },
    };
  });
}

/**
 * Expand/collapse only the subtree rooted at `originId`, leaving every
 * other branch of the map untouched. `relLevel` is RELATIVE to the
 * origin's own depth — pressing N with a node selected reveals N levels
 * under it. Origin itself is always expanded so its direct children
 * are visible at relLevel=1.
 */
export function expandSubtreeToLevel(
  nodes: RfNode[],
  edges: RfEdge[],
  originId: string,
  relLevel: number,
): RfNode[] {
  const { byId, children } = buildMaps(nodes, edges);
  const origin = byId.get(originId);
  if (!origin) return nodes;
  const originDepth = origin.data.depth as number;

  // Walk origin's subtree and mark which nodes should be expanded vs
  // collapsed based on (depth − originDepth). Anything outside the
  // subtree is left as-is in the output map below.
  const subtreeWanted = new Map<string, boolean>();
  const stack: string[] = [originId];
  while (stack.length) {
    const id = stack.pop()!;
    const n = byId.get(id);
    if (!n) continue;
    const depth = n.data.depth as number;
    const rel = depth - originDepth;
    subtreeWanted.set(id, rel < relLevel);
    for (const c of children.get(id) ?? []) stack.push(c);
  }

  return nodes.map((n) => {
    if (!subtreeWanted.has(n.id)) return n;
    if (!n.data.hasChildren) return n;
    const raw = n.data.raw.data ?? {};
    const shouldExpand = subtreeWanted.get(n.id) === true;
    if ((raw.expand !== false) === shouldExpand) return n;
    return {
      ...n,
      data: {
        ...n.data,
        raw: { ...n.data.raw, data: { ...raw, expand: shouldExpand ? undefined : false } },
      },
    };
  });
}

export function filterCollapsed(
  nodes: RfNode[],
  edges: RfEdge[],
): { nodes: RfNode[]; edges: RfEdge[] } {
  const { children } = buildMaps(nodes, edges);
  const hidden = new Set<string>();
  for (const n of nodes) {
    const raw = n.data.raw.data ?? {};
    if (raw.expand === false) {
      for (const id of descendantsOf(children, n.id)) hidden.add(id);
    }
  }
  if (!hidden.size) return { nodes, edges };
  return {
    nodes: nodes.filter((n) => !hidden.has(n.id)),
    edges: edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)),
  };
}
