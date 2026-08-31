import type { Node, Edge } from "@xyflow/react";
import type { MindMapNode } from "../types";

function stripHtml(input: string): string {
  if (!input) return "";
  if (!/[<&]/.test(input)) return input;
  const withoutTags = input
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(p|div|span|strong|em|b|i|u|a)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "");
  const txt =
    typeof document !== "undefined"
      ? (() => {
          const el = document.createElement("textarea");
          el.innerHTML = withoutTags;
          return el.value;
        })()
      : withoutTags
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
  return txt.trim();
}

export type RfNodeData = {
  label: string;
  depth: number;
  branchIndex: number;
  raw: MindMapNode;
  hasChildren: boolean;
  collapsed?: boolean;
  [key: string]: unknown;
};

export type RfNode = Node<RfNodeData, "mind">;
export type RfEdge = Edge;

// MindNode palette — matches the default color picker in MindNode app
const BRANCH_COLORS = [
  "#0080FF", "#F7821B", "#46B247", "#7F00FF",
  "#E24453", "#28A7FF", "#3454FF", "#9494DE",
  "#B3B2FF", "#D8AA0A",
];

export function branchColor(branchIndex: number): string {
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length];
}

/**
 * Each outline item becomes an independent root (depth 0).
 * If outline is empty, a single default root is created with `rootTitle`.
 */
export function outlineToRf(
  outline: MindMapNode[],
  rootTitle: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  const nodes: RfNode[] = [];
  const edges: RfEdge[] = [];
  let idCounter = 0;
  const used = new Set<string>();
  const nextId = () => {
    let id: string;
    do { id = `n${++idCounter}`; } while (used.has(id));
    used.add(id);
    return id;
  };
  // STABLE ids: derive the React Flow node id from the node's persistent
  // sourceId when it has one. Then a rebuild from Yjs produces the SAME ids for
  // unchanged nodes, so React Flow diffs and updates only what changed —
  // positions, selection and in-progress edits on every other node survive.
  // (Regenerating fresh n1,n2,… on every remote update was what made collab
  // feel janky: the whole graph got torn down and rebuilt each time.)
  const idFor = (item: MindMapNode): string => {
    const sid = item.data?.sourceId as string | undefined;
    if (sid && !used.has(sid)) { used.add(sid); return sid; }
    return nextId();
  };

  // If no outline items, create one default root
  const roots: MindMapNode[] = outline.length
    ? outline
    : [{ name: rootTitle }];

  roots.forEach((rootItem, rootIdx) => {
    const rootId = idFor(rootItem);
    const cleanName = stripHtml(rootItem.name || rootTitle);
    nodes.push({
      id: rootId,
      type: "mind",
      // ELK lays out from (0, 0); pins in raw.data are honored by layoutElk.
      position: { x: 0, y: 0 },
      data: {
        label: cleanName,
        depth: 0,
        branchIndex: rootIdx,
        raw: { ...rootItem, name: cleanName },
        hasChildren: (rootItem.children?.length ?? 0) > 0,
      },
    });

    function walk(parent: MindMapNode, parentId: string, depth: number, branchIdx: number, parentBranchType: string) {
      const children = parent.children ?? [];
      children.forEach((child, i) => {
        const id = idFor(child);
        const myBranch = depth === 0 ? i : branchIdx;
        const childName = stripHtml(child.name);
        // Inherit branch type from parent if child doesn't define its own
        const ownBranchType = child.data?.branchType as string | undefined;
        const effectiveBranchType = ownBranchType ?? parentBranchType;
        nodes.push({
          id,
          type: "mind",
          position: { x: 0, y: 0 },
          data: {
            label: childName,
            depth: depth + 1,
            branchIndex: myBranch,
            raw: { ...child, name: childName },
            hasChildren: (child.children?.length ?? 0) > 0,
          },
        });
        const childTier = child.data?.tier as string | undefined;
        const edgeStroke = childTier === "etalon"
          ? "#10B981"
          : childTier === "buffer"
          ? "#F97316"
          : (child.data?.lineColor as string | undefined) ?? branchColor(myBranch);
        const edgeStyle: Record<string, unknown> = { stroke: edgeStroke, strokeWidth: 1.5 };
        if (childTier === "buffer") edgeStyle.strokeDasharray = "6 4";
        edges.push({
          id: `e${parentId}-${id}`,
          source: parentId,
          target: id,
          type: effectiveBranchType,
          style: edgeStyle,
        });
        walk(child, id, depth + 1, myBranch, effectiveBranchType);
      });
    }

    const rootBranchType = (rootItem.data?.branchType as string | undefined) ?? "step";
    walk(rootItem, rootId, 0, -1, rootBranchType);
  });

  return { nodes, edges };
}

/**
 * Each depth-0 node becomes an outline item (with its subtree).
 */
export function rfToOutline(nodes: RfNode[], edges: RfEdge[]): MindMapNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childrenOf.get(e.source) ?? [];
    arr.push(e.target);
    childrenOf.set(e.source, arr);
  }

  const roots = nodes.filter((n) => n.data.depth === 0);
  if (!roots.length) return [];

  function build(id: string): MindMapNode {
    const n = byId.get(id)!;
    const childIds = childrenOf.get(id) ?? [];
    return {
      name: n.data.label,
      children: childIds.length ? childIds.map(build) : undefined,
      // __rfid = the React Flow node id — lets a collab layer map a freshly
      // created node to a stable sourceId without re-rendering the editor.
      data: { ...(n.data.raw.data ?? {}), __rfid: n.id },
    };
  }

  return roots.map((r) => {
    const childIds = childrenOf.get(r.id) ?? [];
    return {
      name: r.data.label,
      children: childIds.length ? childIds.map(build) : undefined,
      data: { ...(r.data.raw.data ?? {}), __rfid: r.id },
    };
  });
}
