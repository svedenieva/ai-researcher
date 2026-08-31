import type { RfNode, RfEdge } from "./mindmap-to-rf";

export type Shape =
  | "auto"
  | "none"
  | "line"
  | "rectangle"
  | "square"
  | "roundedRectangle"
  | "pill"
  | "parallelogram"
  | "diamond"
  | "hexagon"
  | "triangle"
  | "oval"
  | "circle"
  // legacy alias, kept for existing data
  | "ellipse";

export const FONT_SIZES = {
  S: 12,
  M: 14,
  L: 18,
  XL: 22,
} as const;

export type FontSizeKey = keyof typeof FONT_SIZES;

// Branch/edge types matching MindNode's Branch Type picker:
// 1. Curved (bezier) — smooth S-curve
// 2. Smooth (smoothstep) — rounded right-angle corners
// 3. Orthogonal (step) — sharp right-angle corners (MindNode "straight")
export type BranchType = "default" | "smoothstep" | "step";

export const BRANCH_TYPES: { key: BranchType; label: string }[] = [
  { key: "default", label: "Curved" },
  { key: "smoothstep", label: "Smooth" },
  { key: "step", label: "Straight" },
];

export const FONT_FAMILIES: { key: string; label: string; css: string }[] = [
  { key: "dm-sans", label: "DM Sans", css: "'DM Sans', sans-serif" },
  { key: "inter", label: "Inter", css: "'Inter', sans-serif" },
  { key: "roboto", label: "Roboto", css: "'Roboto', sans-serif" },
  { key: "nunito", label: "Nunito", css: "'Nunito', sans-serif" },
  { key: "comic-neue", label: "Comic Neue", css: "'Comic Neue', cursive" },
  { key: "jetbrains-mono", label: "JetBrains Mono", css: "'JetBrains Mono', monospace" },
  { key: "dyslexie", label: "Dyslexie", css: "'Dyslexie', sans-serif" },
];

export function setFontFamily(
  nodes: RfNode[],
  id: string,
  fontFamily: string,
): RfNode[] {
  return nodes.map((n) => (n.id === id ? patchRaw(n, { fontFamily }) : n));
}

export function patchRaw(node: RfNode, patch: Record<string, unknown>): RfNode {
  return {
    ...node,
    data: {
      ...node.data,
      raw: {
        ...node.data.raw,
        data: { ...(node.data.raw.data ?? {}), ...patch },
      },
    },
  };
}

function toggleRaw(node: RfNode, key: string, onVal: unknown, offVal: unknown): RfNode {
  const cur = (node.data.raw.data ?? {})[key];
  return patchRaw(node, { [key]: cur === onVal ? offVal : onVal });
}

/** Attach (or, with an empty string, clear) a hyperlink on a node. Stored in
 *  the node's raw data under `link`; round-trips via `_meta` in serialization. */
export function setLink(nodes: RfNode[], id: string, url: string): RfNode[] {
  const v = url.trim();
  return nodes.map((n) => (n.id === id ? patchRaw(n, { link: v || undefined }) : n));
}

export function toggleBold(nodes: RfNode[], id: string): RfNode[] {
  return nodes.map((n) =>
    n.id === id ? toggleRaw(n, "fontWeight", "bold", "normal") : n,
  );
}

export function toggleItalic(nodes: RfNode[], id: string): RfNode[] {
  return nodes.map((n) =>
    n.id === id ? toggleRaw(n, "fontStyle", "italic", "normal") : n,
  );
}

export function setFontSize(
  nodes: RfNode[],
  id: string,
  size: number,
): RfNode[] {
  return nodes.map((n) => (n.id === id ? patchRaw(n, { fontSize: size }) : n));
}

export function setShape(nodes: RfNode[], id: string, shape: Shape): RfNode[] {
  return nodes.map((n) => (n.id === id ? patchRaw(n, { shape }) : n));
}

export type BorderStyle = "none" | "solid" | "dotted" | "animated";

export function setBorderStyle(
  nodes: RfNode[],
  id: string,
  borderStyle: BorderStyle,
): RfNode[] {
  return nodes.map((n) => (n.id === id ? patchRaw(n, { borderStyle }) : n));
}

/**
 * Set branch/edge type for a node and update all edges in its subtree.
 * Stores type in node data and updates edge.type for the incoming edge + all descendant edges.
 */
export function setBranchType(
  nodes: RfNode[],
  edges: RfEdge[],
  id: string,
  branchType: BranchType,
): { nodes: RfNode[]; edges: RfEdge[] } {
  // Store in node data
  const nextNodes = nodes.map((n) =>
    n.id === id ? patchRaw(n, { branchType }) : n,
  );
  // Collect all descendant node IDs
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childrenOf.get(e.source) ?? [];
    arr.push(e.target);
    childrenOf.set(e.source, arr);
  }
  const subtreeIds = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const nid = stack.pop()!;
    for (const kid of childrenOf.get(nid) ?? []) {
      subtreeIds.add(kid);
      stack.push(kid);
    }
  }
  // Update edge type for incoming edge + all edges within subtree
  const nextEdges = edges.map((e) => {
    if (e.target === id || subtreeIds.has(e.source)) {
      return { ...e, type: branchType };
    }
    return e;
  });
  return { nodes: nextNodes, edges: nextEdges };
}

export const TAG_PRESETS = [
  "done",
  "in progress",
  "todo",
  "blocked",
  "question",
  "idea",
  "important",
  "review",
] as const;

export const ICON_PRESETS = ["⭐", "🔥", "✅", "❗", "❓", "💡", "📌", "🎯"] as const;

function toggleRawArray(nodes: RfNode[], id: string, key: string, value: string): RfNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const cur = ((n.data.raw.data ?? {})[key] as string[] | undefined) ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    return patchRaw(n, { [key]: next });
  });
}

export function toggleTag(nodes: RfNode[], id: string, tag: string): RfNode[] {
  return toggleRawArray(nodes, id, "tag", tag);
}

export function toggleIcon(nodes: RfNode[], id: string, icon: string): RfNode[] {
  return toggleRawArray(nodes, id, "icon", icon);
}

/**
 * Legacy absolute-pin write. Step 1 of the pin refactor migrated all
 * editor flows onto `setOffset` (delta model); `setCustomPosition` is
 * retained only because layout-elk still reads `customLeft/customTop`
 * for backwards compatibility with maps imported from MindNode files.
 * No new write call sites should land — use `setOffset` instead.
 *
 * The earlier `_homeX/_homeY` snapshot field has been removed: nothing
 * read it (phantom rendering takes auto-pos directly from layout-elk's
 * `autoAbsPos` map at render time), so it was dead data.
 */
export function setCustomPosition(
  nodes: RfNode[],
  id: string,
  x: number,
  y: number,
): RfNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    return patchRaw(
      { ...n, position: { x, y } },
      { customLeft: x, customTop: y },
    );
  });
}

export function clearCustomPosition(
  nodes: RfNode[],
  id: string,
): RfNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const rawData = { ...((n.data.raw.data as Record<string, unknown>) ?? {}) };
    delete rawData.customLeft;
    delete rawData.customTop;
    delete rawData.offsetX;
    delete rawData.offsetY;
    // Also drop the phantom home snapshot — node is back in auto-layout.
    delete rawData._homeX;
    delete rawData._homeY;
    return {
      ...n,
      data: {
        ...n.data,
        raw: { ...n.data.raw, data: rawData },
      },
    };
  });
}

/**
 * Set a relative offset from auto-position (MindNode "Personal Touch" /
 * Flexible Layout model). Unlike setCustomPosition (absolute), this is
 * a DELTA the layout engine applies on top of the auto-computed slot —
 * when the parent moves, the child's display position moves with it and
 * the offset is reapplied.
 *
 * Strips legacy `customLeft/customTop` + `_homeX/_homeY` fields when
 * writing the offset: layout-elk prioritises absolute pin over offset,
 * so leaving them behind would cause the node to ignore the new offset
 * and stay at its old absolute coordinates. Once a node is on the
 * delta model, no caller should reintroduce the absolute fields.
 */
export function setOffset(
  nodes: RfNode[],
  id: string,
  offsetX: number,
  offsetY: number,
): RfNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const rawData = { ...((n.data.raw.data as Record<string, unknown>) ?? {}) };
    delete rawData.customLeft;
    delete rawData.customTop;
    delete rawData._homeX;
    delete rawData._homeY;
    rawData.offsetX = offsetX;
    rawData.offsetY = offsetY;
    return {
      ...n,
      data: {
        ...n.data,
        raw: { ...n.data.raw, data: rawData },
      },
    };
  });
}

/** Remove offset (and legacy custom position) → node returns to auto-layout. */
export function clearOffset(
  nodes: RfNode[],
  id: string,
): RfNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const rawData = { ...((n.data.raw.data as Record<string, unknown>) ?? {}) };
    delete rawData.offsetX;
    delete rawData.offsetY;
    return {
      ...n,
      data: {
        ...n.data,
        raw: { ...n.data.raw, data: rawData },
      },
    };
  });
}
