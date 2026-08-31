import type { MindMapNode } from "../types";
import type { RfNode, RfEdge } from "./mindmap-to-rf";
import { branchColor } from "./mindmap-to-rf";
import { buildMaps } from "./tree-nav";

let idSeed = 1000;
function nextId(): string {
  return `n${++idSeed}`;
}

/** Get the effective edge type for a new edge under parentId by looking at the parent's branchType or existing sibling edges. */
function edgeTypeFor(parentId: string, nodes: RfNode[], edges: RfEdge[]): string {
  // Check parent node's branchType
  const parent = nodes.find((n) => n.id === parentId);
  const parentBT = (parent?.data.raw.data as Record<string, unknown> | undefined)?.branchType as string | undefined;
  if (parentBT) return parentBT;
  // Check the incoming edge to the parent (inherit from grandparent)
  const parentEdge = edges.find((e) => e.target === parentId);
  if (parentEdge?.type) return parentEdge.type;
  return "step";
}

function childrenOfMap(edges: RfEdge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const arr = m.get(e.source) ?? [];
    arr.push(e.target);
    m.set(e.source, arr);
  }
  return m;
}

function parentOfMap(edges: RfEdge[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of edges) m.set(e.target, e.source);
  return m;
}

export function addRoot(
  nodes: RfNode[],
  edges: RfEdge[],
  label = "Новый узел",
): { nodes: RfNode[]; edges: RfEdge[]; newId: string } {
  const id = nextId();
  // Place new root below the last existing root
  const roots = nodes.filter((n) => n.data.depth === 0);
  const lastRoot = roots[roots.length - 1];
  const yOffset = lastRoot ? lastRoot.position.y + 100 : 0;
  const xPos = lastRoot ? lastRoot.position.x : 0;

  const newNode: RfNode = {
    id,
    type: "mind",
    position: { x: xPos, y: yOffset },
    data: {
      label,
      depth: 0,
      branchIndex: roots.length,
      raw: { name: label },
      hasChildren: false,
    },
  };

  return {
    nodes: [...nodes, newNode],
    edges,
    newId: id,
  };
}

export function addChild(
  nodes: RfNode[],
  edges: RfEdge[],
  parentId: string,
  label = "Новый узел",
): { nodes: RfNode[]; edges: RfEdge[]; newId: string } {
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { nodes, edges, newId: "" };

  const parentDepth = parent.data.depth;
  const newDepth = parentDepth + 1;
  const existingChildren = edges.filter((e) => e.source === parentId).length;
  const myBranch =
    parentDepth === 0 ? existingChildren : parent.data.branchIndex;

  const id = nextId();
  const parentLineColor = parent.data.raw.data?.lineColor as string | undefined;
  const edgeStroke = parentLineColor ?? branchColor(myBranch);
  // Inherit style from parent
  const inherited = inheritStyle(parent) ?? {};
  if (parentLineColor) {
    inherited.lineColor = parentLineColor;
  }
  // Position: to the right of parent, offset vertically per existing children
  const parentW = parent.measured?.width ?? 120;
  const newNode: RfNode = {
    id,
    type: "mind",
    position: {
      x: parent.position.x + parentW + 40,
      y: parent.position.y + existingChildren * 50,
    },
    data: {
      label,
      depth: newDepth,
      branchIndex: myBranch,
      raw: { name: label, data: Object.keys(inherited).length ? inherited : undefined },
      hasChildren: false,
    },
  };
  const newEdge: RfEdge = {
    id: `e${parentId}-${id}`,
    source: parentId,
    target: id,
    type: "step",
    style: { stroke: edgeStroke, strokeWidth: 1.5 },
  };

  const updatedNodes = nodes.map((n) =>
    n.id === parentId ? { ...n, data: { ...n.data, hasChildren: true } } : n,
  );

  return {
    nodes: [...updatedNodes, newNode],
    edges: [...edges, newEdge],
    newId: id,
  };
}

export function addSibling(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
  label = "Новый узел",
): { nodes: RfNode[]; edges: RfEdge[]; newId: string } {
  // If the node is a root, add a new independent root
  const target = nodes.find((n) => n.id === nodeId);
  if (target?.data.depth === 0) return addRoot(nodes, edges, label);

  const parents = parentOfMap(edges);
  const parentId = parents.get(nodeId);
  if (!parentId) return { nodes, edges, newId: "" };
  return addChild(nodes, edges, parentId, label);
}

function descendantIds(edges: RfEdge[], rootId: string): Set<string> {
  const children = childrenOfMap(edges);
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    for (const c of children.get(id) ?? []) stack.push(c);
  }
  return out;
}

export function removeNode(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target) return { nodes, edges };
  // Allow deleting a root only if there are other roots
  if (target.data.depth === 0) {
    const rootCount = nodes.filter((n) => n.data.depth === 0).length;
    if (rootCount <= 1) return { nodes, edges };
  }

  const toRemove = descendantIds(edges, nodeId);
  const parents = parentOfMap(edges);
  const parentId = parents.get(nodeId);

  const remainingNodes = nodes.filter((n) => !toRemove.has(n.id));
  const remainingEdges = edges.filter(
    (e) => !toRemove.has(e.source) && !toRemove.has(e.target),
  );

  if (parentId) {
    const stillHasChildren = remainingEdges.some((e) => e.source === parentId);
    return {
      nodes: remainingNodes.map((n) =>
        n.id === parentId
          ? { ...n, data: { ...n.data, hasChildren: stillHasChildren } }
          : n,
      ),
      edges: remainingEdges,
    };
  }
  return { nodes: remainingNodes, edges: remainingEdges };
}

export function moveNode(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
  newParentId: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  if (nodeId === newParentId) return { nodes, edges };
  const target = nodes.find((n) => n.id === nodeId);
  const newParent = nodes.find((n) => n.id === newParentId);
  if (!target || !newParent) return { nodes, edges };
  if (target.data.depth === 0) return { nodes, edges };

  // Prevent reparenting into own descendant (would create cycle)
  const subtree = descendantIds(edges, nodeId);
  if (subtree.has(newParentId)) return { nodes, edges };

  const parents = parentOfMap(edges);
  const oldParentId = parents.get(nodeId);
  if (oldParentId === newParentId) return { nodes, edges };

  // Rewrite parent edge
  const nextEdges = edges
    .filter((e) => !(e.target === nodeId && e.source === oldParentId))
    .concat([
      {
        id: `e${newParentId}-${nodeId}`,
        source: newParentId,
        target: nodeId,
        type: edgeTypeFor(newParentId, nodes, edges),
        style: { stroke: "#22c55e", strokeWidth: 1.5 },
      },
    ]);

  // Recompute depth + branchIndex for moved subtree
  const newDepth = newParent.data.depth + 1;
  // Branch index: if new parent is root, use new child position index; else inherit parent's branchIndex
  const newParentChildren = nextEdges.filter((e) => e.source === newParentId).length;
  const branchIdx =
    newParent.data.depth === 0
      ? newParentChildren - 1
      : newParent.data.branchIndex;

  // Build children map from the NEW edge set
  const newChildren = childrenOfMap(nextEdges);

  const depthMap = new Map<string, number>();
  const branchMap = new Map<string, number>();
  const stack: Array<{ id: string; depth: number; branch: number }> = [
    { id: nodeId, depth: newDepth, branch: branchIdx },
  ];
  while (stack.length) {
    const { id, depth, branch } = stack.pop()!;
    depthMap.set(id, depth);
    branchMap.set(id, branch);
    for (const c of newChildren.get(id) ?? []) {
      stack.push({ id: c, depth: depth + 1, branch });
    }
  }

  const color = branchColor(branchIdx);

  const nextNodes = nodes.map((n) => {
    if (depthMap.has(n.id)) {
      const nd = depthMap.get(n.id)!;
      const bi = branchMap.get(n.id)!;
      const rawData = { ...(n.data.raw.data ?? {}) };
      // Clear custom position on moved subtree so elk re-lays it
      delete rawData.customLeft;
      delete rawData.customTop;
      return {
        ...n,
        data: {
          ...n.data,
          depth: nd,
          branchIndex: bi,
          raw: { ...n.data.raw, data: rawData },
        },
      };
    }
    // Old parent: recompute hasChildren
    if (n.id === oldParentId) {
      const still = nextEdges.some((e) => e.source === oldParentId);
      return { ...n, data: { ...n.data, hasChildren: still } };
    }
    // New parent: now has children
    if (n.id === newParentId) {
      return { ...n, data: { ...n.data, hasChildren: true } };
    }
    return n;
  });

  // Recolor subtree edges to match new branch color
  const coloredEdges = nextEdges.map((e) =>
    depthMap.has(e.target)
      ? { ...e, style: { stroke: color, strokeWidth: 1.5 } }
      : e,
  );

  return { nodes: nextNodes, edges: coloredEdges };
}

export function moveNodeAsSibling(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
  anchorId: string,
  position: "before" | "after",
): { nodes: RfNode[]; edges: RfEdge[] } {
  if (nodeId === anchorId) return { nodes, edges };
  const target = nodes.find((n) => n.id === nodeId);
  const anchor = nodes.find((n) => n.id === anchorId);
  if (!target || !anchor) return { nodes, edges };
  if (target.data.depth === 0) return { nodes, edges };
  if (anchor.data.depth === 0) return { nodes, edges };

  const parents = parentOfMap(edges);
  const anchorParentId = parents.get(anchorId);
  if (!anchorParentId) return { nodes, edges };

  const subtree = descendantIds(edges, nodeId);
  if (subtree.has(anchorParentId)) return { nodes, edges };

  const oldParentId = parents.get(nodeId);
  const newParent = nodes.find((n) => n.id === anchorParentId)!;
  const newDepth = newParent.data.depth + 1;

  // Remove old parent edge of moved node
  const filtered = edges.filter(
    (e) => !(e.target === nodeId && e.source === oldParentId),
  );

  // Index of anchor's edge in filtered list
  const anchorEdgeIdx = filtered.findIndex(
    (e) => e.target === anchorId && e.source === anchorParentId,
  );

  // Branch index: if new parent is root, inherit anchor's branch (sibling keeps same branch)
  const branchIdx =
    newParent.data.depth === 0 ? anchor.data.branchIndex : newParent.data.branchIndex;

  const newEdge: RfEdge = {
    id: `e${anchorParentId}-${nodeId}`,
    source: anchorParentId,
    target: nodeId,
    type: edgeTypeFor(anchorParentId, nodes, edges),
    style: { stroke: branchColor(branchIdx), strokeWidth: 1.5 },
  };

  const insertAt =
    anchorEdgeIdx < 0
      ? filtered.length
      : position === "after"
        ? anchorEdgeIdx + 1
        : anchorEdgeIdx;
  const nextEdges = [
    ...filtered.slice(0, insertAt),
    newEdge,
    ...filtered.slice(insertAt),
  ];

  // Recompute depth + branch for moved subtree
  const newChildren = childrenOfMap(nextEdges);
  const depthMap = new Map<string, number>();
  const branchMap = new Map<string, number>();
  const stack: Array<{ id: string; depth: number; branch: number }> = [
    { id: nodeId, depth: newDepth, branch: branchIdx },
  ];
  while (stack.length) {
    const { id, depth, branch } = stack.pop()!;
    depthMap.set(id, depth);
    branchMap.set(id, branch);
    for (const c of newChildren.get(id) ?? []) {
      stack.push({ id: c, depth: depth + 1, branch });
    }
  }

  const color = branchColor(branchIdx);

  const nextNodes = nodes.map((n) => {
    if (depthMap.has(n.id)) {
      const nd = depthMap.get(n.id)!;
      const bi = branchMap.get(n.id)!;
      const rawData = { ...(n.data.raw.data ?? {}) };
      delete rawData.customLeft;
      delete rawData.customTop;
      return {
        ...n,
        data: {
          ...n.data,
          depth: nd,
          branchIndex: bi,
          raw: { ...n.data.raw, data: rawData },
        },
      };
    }
    if (n.id === oldParentId) {
      const still = nextEdges.some((e) => e.source === oldParentId);
      return { ...n, data: { ...n.data, hasChildren: still } };
    }
    return n;
  });

  const coloredEdges = nextEdges.map((e) =>
    depthMap.has(e.target)
      ? { ...e, style: { stroke: color, strokeWidth: 1.5 } }
      : e,
  );

  return { nodes: nextNodes, edges: coloredEdges };
}

export function renameNode(
  nodes: RfNode[],
  nodeId: string,
  label: string,
): RfNode[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? {
          ...n,
          data: {
            ...n.data,
            label,
            raw: { ...n.data.raw, name: label },
          },
        }
      : n,
  );
}

/**
 * Delete a node but reconnect its children to the node's parent.
 * Like MindNode's Alt+Backspace.
 */
export function removeKeepChildren(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target) return { nodes, edges };
  // Don't allow on root nodes
  if (target.data.depth === 0) return { nodes, edges };

  const parents = parentOfMap(edges);
  const children = childrenOfMap(edges);
  const parentId = parents.get(nodeId);
  if (!parentId) return { nodes, edges };

  const childIds = children.get(nodeId) ?? [];

  // Remove the node and its edges
  let nextEdges = edges.filter(
    (e) => e.source !== nodeId && e.target !== nodeId,
  );

  // Reconnect children to grandparent
  const color = target.data.raw.data?.lineColor as string | undefined
    ?? branchColor(target.data.branchIndex);
  for (const cid of childIds) {
    nextEdges.push({
      id: `e${parentId}-${cid}`,
      source: parentId,
      target: cid,
      type: "step",
      style: { stroke: color, strokeWidth: 1.5 },
    });
  }

  // Update depths for reconnected children subtrees
  const parent = nodes.find((n) => n.id === parentId)!;
  const newChildDepth = parent.data.depth + 1;
  const childMap = childrenOfMap(nextEdges);

  const depthMap = new Map<string, number>();
  for (const cid of childIds) {
    const stack: Array<{ id: string; depth: number }> = [
      { id: cid, depth: newChildDepth },
    ];
    while (stack.length) {
      const { id, depth } = stack.pop()!;
      depthMap.set(id, depth);
      for (const gc of childMap.get(id) ?? []) {
        stack.push({ id: gc, depth: depth + 1 });
      }
    }
  }

  const nextNodes = nodes
    .filter((n) => n.id !== nodeId)
    .map((n) => {
      if (depthMap.has(n.id)) {
        return {
          ...n,
          data: { ...n.data, depth: depthMap.get(n.id)! },
        };
      }
      // Update parent hasChildren
      if (n.id === parentId) {
        const still = nextEdges.some((e) => e.source === parentId);
        return { ...n, data: { ...n.data, hasChildren: still } };
      }
      return n;
    });

  return { nodes: nextNodes, edges: nextEdges };
}

/**
 * Insert a new node between nodeId and its parent.
 * The new node becomes the parent of nodeId.
 * Like MindNode's Alt+Tab.
 */
export function insertParent(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
  label = "Новый узел",
): { nodes: RfNode[]; edges: RfEdge[]; newId: string } {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target) return { nodes, edges, newId: "" };
  if (target.data.depth === 0) return { nodes, edges, newId: "" };

  const parents = parentOfMap(edges);
  const parentId = parents.get(nodeId);
  if (!parentId) return { nodes, edges, newId: "" };

  const id = nextId();
  const newDepth = target.data.depth;
  const branchIdx = target.data.branchIndex;
  const color = target.data.raw.data?.lineColor as string | undefined
    ?? branchColor(branchIdx);

  // New node takes the position between parent and target
  const newNode: RfNode = {
    id,
    type: "mind",
    position: {
      x: target.position.x,
      y: target.position.y,
    },
    data: {
      label,
      depth: newDepth,
      branchIndex: branchIdx,
      raw: { name: label },
      hasChildren: true,
    },
  };

  // Replace edge parent→target with parent→new, new→target
  const nextEdges = edges
    .filter((e) => !(e.source === parentId && e.target === nodeId))
    .concat([
      {
        id: `e${parentId}-${id}`,
        source: parentId,
        target: id,
        type: "step",
        style: { stroke: color, strokeWidth: 1.5 },
      },
      {
        id: `e${id}-${nodeId}`,
        source: id,
        target: nodeId,
        type: "step",
        style: { stroke: color, strokeWidth: 1.5 },
      },
    ]);

  // Increase depth of target and all its descendants
  const childMap = childrenOfMap(nextEdges);
  const depthMap = new Map<string, number>();
  const stack: Array<{ nid: string; depth: number }> = [
    { nid: nodeId, depth: newDepth + 1 },
  ];
  while (stack.length) {
    const { nid, depth } = stack.pop()!;
    depthMap.set(nid, depth);
    for (const c of childMap.get(nid) ?? []) {
      stack.push({ nid: c, depth: depth + 1 });
    }
  }

  const nextNodes = nodes.map((n) => {
    if (depthMap.has(n.id)) {
      return {
        ...n,
        data: { ...n.data, depth: depthMap.get(n.id)! },
      };
    }
    return n;
  });

  return {
    nodes: [...nextNodes, newNode],
    edges: nextEdges,
    newId: id,
  };
}

/**
 * Reorder a node among its siblings (move up/down).
 * Like MindNode's Cmd+Up/Down.
 */
export function reorderSibling(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
  direction: "up" | "down",
): { nodes: RfNode[]; edges: RfEdge[] } {
  const parents = parentOfMap(edges);
  const parentId = parents.get(nodeId);
  if (!parentId) return { nodes, edges };

  // Get sibling edges in order
  const siblingEdges = edges.filter((e) => e.source === parentId);
  const idx = siblingEdges.findIndex((e) => e.target === nodeId);
  if (idx < 0) return { nodes, edges };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblingEdges.length) return { nodes, edges };

  // Swap the two edges in the full edges array
  const edgeA = siblingEdges[idx];
  const edgeB = siblingEdges[swapIdx];
  const nextEdges = edges.map((e) => {
    if (e === edgeA) return edgeB;
    if (e === edgeB) return edgeA;
    return e;
  });

  return { nodes, edges: nextEdges };
}

/**
 * Indent: make nodeId a child of the sibling above it.
 * Like MindNode's Cmd+Right.
 */
export function indentNode(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target || target.data.depth === 0) return { nodes, edges };

  const parents = parentOfMap(edges);
  const parentId = parents.get(nodeId);
  if (!parentId) return { nodes, edges };

  // Find sibling above
  const siblingEdges = edges.filter((e) => e.source === parentId);
  const idx = siblingEdges.findIndex((e) => e.target === nodeId);
  if (idx <= 0) return { nodes, edges }; // No sibling above

  const newParentId = siblingEdges[idx - 1].target;
  return moveNode(nodes, edges, nodeId, newParentId);
}

/**
 * Outdent: make nodeId a sibling of its parent (after parent).
 * Like MindNode's Cmd+Left.
 */
export function outdentNode(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target || target.data.depth <= 1) return { nodes, edges };

  const parents = parentOfMap(edges);
  const parentId = parents.get(nodeId);
  if (!parentId) return { nodes, edges };

  const grandparentId = parents.get(parentId);
  if (!grandparentId) return { nodes, edges };

  return moveNodeAsSibling(nodes, edges, nodeId, parentId, "after");
}

/**
 * Detach a node (and its subtree) from its parent, making it a new root.
 * Like MindNode's Shift+Cmd+D.
 */
export function detachToRoot(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target || target.data.depth === 0) return { nodes, edges };

  const parents = parentOfMap(edges);
  const oldParentId = parents.get(nodeId);

  // Remove edge from parent
  const nextEdges = edges.filter(
    (e) => !(e.target === nodeId && e.source === oldParentId),
  );

  // Find new root position: below the last existing root
  const roots = nodes.filter((n) => n.data.depth === 0);
  const lastRoot = roots[roots.length - 1];
  const yOffset = lastRoot ? lastRoot.position.y + 100 : 0;
  const xPos = lastRoot ? lastRoot.position.x : 0;
  const newBranchIndex = roots.length;

  // Recompute depths for detached subtree
  const childMap = childrenOfMap(nextEdges);
  const depthMap = new Map<string, number>();
  const branchMap = new Map<string, number>();
  const stack: Array<{ id: string; depth: number }> = [
    { id: nodeId, depth: 0 },
  ];
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    depthMap.set(id, depth);
    branchMap.set(id, newBranchIndex);
    for (const c of childMap.get(id) ?? []) {
      stack.push({ id: c, depth: depth + 1 });
    }
  }

  const color = branchColor(newBranchIndex);

  const nextNodes = nodes.map((n) => {
    if (n.id === nodeId) {
      const rawData = { ...(n.data.raw.data ?? {}) };
      delete rawData.customLeft;
      delete rawData.customTop;
      return {
        ...n,
        position: { x: xPos, y: yOffset },
        data: {
          ...n.data,
          depth: 0,
          branchIndex: newBranchIndex,
          raw: { ...n.data.raw, data: rawData },
          hasChildren: (childMap.get(nodeId) ?? []).length > 0,
        },
      };
    }
    if (depthMap.has(n.id) && n.id !== nodeId) {
      const rawData = { ...(n.data.raw.data ?? {}) };
      delete rawData.customLeft;
      delete rawData.customTop;
      return {
        ...n,
        data: {
          ...n.data,
          depth: depthMap.get(n.id)!,
          branchIndex: newBranchIndex,
          raw: { ...n.data.raw, data: rawData },
        },
      };
    }
    // Old parent: recompute hasChildren
    if (n.id === oldParentId) {
      const still = nextEdges.some((e) => e.source === oldParentId);
      return { ...n, data: { ...n.data, hasChildren: still } };
    }
    return n;
  });

  // Recolor subtree edges
  const coloredEdges = nextEdges.map((e) =>
    depthMap.has(e.target)
      ? { ...e, style: { stroke: color, strokeWidth: 1.5 } }
      : e,
  );

  return { nodes: nextNodes, edges: coloredEdges };
}

/**
 * Add sibling above the given node (before it in sibling order).
 * Like MindNode's Alt+Enter.
 */
export function addSiblingBefore(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
  label = "Новый узел",
): { nodes: RfNode[]; edges: RfEdge[]; newId: string } {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target) return { nodes, edges, newId: "" };
  if (target.data.depth === 0) return addRoot(nodes, edges, label);

  const parents = parentOfMap(edges);
  const parentId = parents.get(nodeId);
  if (!parentId) return { nodes, edges, newId: "" };

  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { nodes, edges, newId: "" };

  const id = nextId();
  const newDepth = parent.data.depth + 1;
  const branchIdx =
    parent.data.depth === 0 ? target.data.branchIndex : parent.data.branchIndex;
  const edgeStroke = branchColor(branchIdx);

  const newNode: RfNode = {
    id,
    type: "mind",
    position: {
      x: target.position.x,
      y: target.position.y - 50,
    },
    data: {
      label,
      depth: newDepth,
      branchIndex: branchIdx,
      raw: { name: label },
      hasChildren: false,
    },
  };

  // Insert edge before the target's edge
  const targetEdgeIdx = edges.findIndex(
    (e) => e.source === parentId && e.target === nodeId,
  );
  const newEdge: RfEdge = {
    id: `e${parentId}-${id}`,
    source: parentId,
    target: id,
    type: "step",
    style: { stroke: edgeStroke, strokeWidth: 1.5 },
  };

  const insertAt = targetEdgeIdx >= 0 ? targetEdgeIdx : edges.length;
  const nextEdges = [
    ...edges.slice(0, insertAt),
    newEdge,
    ...edges.slice(insertAt),
  ];

  return {
    nodes: [...nodes, newNode],
    edges: nextEdges,
    newId: id,
  };
}

/**
 * Extract inheritable style data from a parent node for a new child.
 */
export function inheritStyle(parentNode: RfNode): Record<string, unknown> | undefined {
  const raw = parentNode.data.raw.data ?? {};
  const inherited: Record<string, unknown> = {};
  if (raw.shape) inherited.shape = raw.shape;
  if (raw.fontFamily) inherited.fontFamily = raw.fontFamily;
  if (raw.fontSize) inherited.fontSize = raw.fontSize;
  if (raw.borderStyle) inherited.borderStyle = raw.borderStyle;
  if (raw.lineColor) inherited.lineColor = raw.lineColor;
  return Object.keys(inherited).length ? inherited : undefined;
}

/**
 * Copy all style properties from one node to apply on another.
 */
export function extractStyle(node: RfNode): Record<string, unknown> {
  const raw = node.data.raw.data ?? {};
  const style: Record<string, unknown> = {};
  const keys = [
    "shape", "fontFamily", "fontSize", "fontWeight", "fontStyle",
    "borderStyle", "color", "fillColor", "lineColor",
  ];
  for (const k of keys) {
    if (raw[k] !== undefined) style[k] = raw[k];
  }
  return style;
}

/**
 * Apply a style object to a node.
 */
export function applyStyle(
  nodes: RfNode[],
  nodeId: string,
  style: Record<string, unknown>,
): RfNode[] {
  return nodes.map((n) => {
    if (n.id !== nodeId) return n;
    return {
      ...n,
      data: {
        ...n.data,
        raw: {
          ...n.data.raw,
          data: { ...(n.data.raw.data ?? {}), ...style },
        },
      },
    };
  });
}

export function applySelection(nodes: RfNode[], id: string | null): RfNode[] {
  return nodes.map((n) => {
    const want = n.id === id;
    if ((n.selected ?? false) === want) return n;
    return { ...n, selected: want };
  });
}

export function serializeSubtree(
  nodes: RfNode[],
  edges: RfEdge[],
  rootId: string,
): MindMapNode | null {
  const { byId, children } = buildMaps(nodes, edges);
  if (!byId.get(rootId)) return null;
  function build(id: string): MindMapNode {
    // Non-null asserts safe: only descendants of an existing root are walked.
    const n = byId.get(id)!;
    const kids = children.get(id) ?? [];
    return {
      name: n.data.label,
      children: kids.length ? kids.map(build) : undefined,
      data: n.data.raw.data,
    };
  }
  return build(rootId);
}

// Session-local seed for paste ids. Resets on page reload, which is fine —
// pasted nodes are persisted with server-assigned ids on save.
let pasteIdSeed = 5000;

export function insertSubtree(
  nodes: RfNode[],
  edges: RfEdge[],
  parentId: string,
  subtree: MindMapNode,
): { nodes: RfNode[]; edges: RfEdge[]; newId: string } {
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { nodes, edges, newId: "" };

  const newNodes: RfNode[] = [];
  const newEdges: RfEdge[] = [];

  function walk(
    tree: MindMapNode,
    parentIdLocal: string,
    depth: number,
    branch: number,
  ): string {
    const id = `p${++pasteIdSeed}`;
    newNodes.push({
      id,
      type: "mind",
      position: { x: 0, y: 0 },
      data: {
        label: tree.name,
        depth,
        branchIndex: branch,
        raw: { name: tree.name, data: tree.data },
        hasChildren: (tree.children?.length ?? 0) > 0,
      },
    });
    newEdges.push({
      id: `e${parentIdLocal}-${id}`,
      source: parentIdLocal,
      target: id,
      type: "step",
      style: { strokeWidth: 1.5 },
    });
    for (const c of tree.children ?? []) walk(c, id, depth + 1, branch);
    return id;
  }

  const parentDepth = parent.data.depth;
  const parentBranch = parent.data.branchIndex;
  const topId = walk(subtree, parentId, parentDepth + 1, parentBranch);

  const updatedNodes = nodes.map((n) =>
    n.id === parentId ? { ...n, data: { ...n.data, hasChildren: true } } : n,
  );
  return {
    nodes: [...updatedNodes, ...newNodes],
    edges: [...edges, ...newEdges],
    newId: topId,
  };
}
