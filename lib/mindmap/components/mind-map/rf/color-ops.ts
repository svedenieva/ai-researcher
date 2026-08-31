import type { RfNode, RfEdge } from "./mindmap-to-rf";
import { patchRaw } from "./style-ops";

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// MindNode palette (top row: light, bottom row: dark)
export const PALETTE = [
  "#B3B2FF", "#28A7FF", "#0080FF", "#F7821B", "#46B247",
  "#7F00FF", "#FF2D55", "#E24453", "#D8AA0A", "#8E8E93",
  "#3454FF", "#1FACE6", "#0000CC", "#993300", "#006600",
  "#0000FF", "#CC0000", "#9494DE", "#333333", "#000000",
];

export function setTextColor(
  nodes: RfNode[],
  nodeId: string,
  color: string,
): RfNode[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? patchRaw(
          { ...n, data: { ...n.data, textColor: color } },
          { color, customColor: true },
        )
      : n,
  );
}

export function setBackgroundColor(
  nodes: RfNode[],
  nodeId: string,
  color: string,
): RfNode[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? patchRaw(
          { ...n, data: { ...n.data, bgColor: color } },
          { fillColor: color },
        )
      : n,
  );
}

export function setLineColor(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
  color: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  // Only change the target node and its incoming edge — NOT descendants.
  // Multi-select is handled by applyToTargets calling this per node.
  const nextEdges = edges.map((e) => {
    if (e.target !== nodeId) return e;
    return { ...e, style: { ...(e.style ?? {}), stroke: color } };
  });

  const nextNodes = nodes.map((n) => {
    if (n.id !== nodeId) return n;
    return patchRaw(n, { lineColor: color, customLineColor: true });
  });

  return { nodes: nextNodes, edges: nextEdges };
}

export function resetLineColor(
  nodes: RfNode[],
  edges: RfEdge[],
  nodeId: string,
): { nodes: RfNode[]; edges: RfEdge[] } {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target) return { nodes, edges };
  const nextNodes = nodes.map((n) => {
    if (n.id !== nodeId) return n;
    const raw = { ...(n.data.raw.data ?? {}) };
    delete raw.customLineColor;
    delete raw.lineColor;
    return {
      ...n,
      data: { ...n.data, raw: { ...n.data.raw, data: raw } },
    };
  });
  return { nodes: nextNodes, edges };
}
