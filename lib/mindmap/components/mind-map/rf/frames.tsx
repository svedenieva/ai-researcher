"use client";

import { memo, useMemo } from "react";
import { ViewportPortal } from "@xyflow/react";
import type { RfNode, RfEdge } from "./mindmap-to-rf";
import { buildMaps } from "./tree-nav";

export type FrameType =
  | "none"
  | "underline"
  | "square-bracket"
  | "curved-bracket"
  | "square-bracket-left"
  | "curved-bracket-left";

const FRAME_GAP = 12;
const FRAME_DEPTH = 14;
const STROKE = "#9CA3AF";
const STROKE_W = 1.5;

export type Rect = { x: number; y: number; w: number; h: number };

function subtreeRect(
  rootId: string,
  nodes: RfNode[],
  children: Map<string, string[]>,
): Rect | null {
  const ids: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    ids.push(id);
    for (const c of children.get(id) ?? []) stack.push(c);
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const n = nodes.find((x) => x.id === id);
    if (!n) continue;
    const w = (n.measured?.width ?? 0) || 180;
    const h = (n.measured?.height ?? 0) || 44;
    const x = n.position.x;
    const y = n.position.y;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function framePath(type: FrameType, r: Rect): string | null {
  const pad = FRAME_GAP;
  const d = FRAME_DEPTH;
  const x1 = r.x - pad;
  const x2 = r.x + r.w + pad;
  const y1 = r.y - pad;
  const y2 = r.y + r.h + pad;

  if (type === "underline") {
    return `M ${x1} ${y2} L ${x2} ${y2}`;
  }
  if (type === "square-bracket") {
    return (
      `M ${x1 + d} ${y1} L ${x1} ${y1} L ${x1} ${y2} L ${x1 + d} ${y2} ` +
      `M ${x2 - d} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x2 - d} ${y2}`
    );
  }
  if (type === "curved-bracket") {
    return (
      `M ${x1 + d} ${y1} Q ${x1} ${y1}, ${x1} ${y1 + d} ` +
      `L ${x1} ${y2 - d} Q ${x1} ${y2}, ${x1 + d} ${y2} ` +
      `M ${x2 - d} ${y1} Q ${x2} ${y1}, ${x2} ${y1 + d} ` +
      `L ${x2} ${y2 - d} Q ${x2} ${y2}, ${x2 - d} ${y2}`
    );
  }
  if (type === "square-bracket-left") {
    // Bracket: right tips overlap node left edge by 2px for seamless join with edge line
    const lx = r.x + 2;
    const ld = 10;
    const ly1 = r.y + 4;
    const ly2 = r.y + r.h - 4;
    return `M ${lx} ${ly1} L ${lx - ld} ${ly1} L ${lx - ld} ${ly2} L ${lx} ${ly2}`;
  }
  if (type === "curved-bracket-left") {
    // Curved bracket: tips at node left edge, curves left
    const lx = r.x + 2;
    const ld = 10;
    const ly1 = r.y + 4;
    const ly2 = r.y + r.h - 4;
    const cr = Math.min(8, (ly2 - ly1) / 3);
    return (
      `M ${lx} ${ly1} Q ${lx - ld} ${ly1}, ${lx - ld} ${ly1 + cr} ` +
      `L ${lx - ld} ${ly2 - cr} Q ${lx - ld} ${ly2}, ${lx} ${ly2}`
    );
  }
  return null;
}

interface FrameOverlayProps {
  nodes: RfNode[];
  edges: RfEdge[];
}

/** Get bounding rect of a single node (no subtree) */
export function nodeRect(node: RfNode): Rect {
  const w = (node.measured?.width ?? 0) || 180;
  const h = (node.measured?.height ?? 0) || 44;
  return { x: node.position.x, y: node.position.y, w, h };
}

const LEFT_ONLY: Set<FrameType> = new Set(["square-bracket-left", "curved-bracket-left"]);

function FrameOverlayView({ nodes, edges }: FrameOverlayProps) {
  const paths = useMemo(() => {
    const { children } = buildMaps(nodes, edges);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const out: { id: string; d: string; color: string }[] = [];
    for (const n of nodes) {
      const frame = (n.data.raw.data?.frame as FrameType | undefined) ?? "none";
      if (frame === "none") continue;
      const color = (n.data.raw.data?.lineColor as string | undefined) ?? STROKE;

      if (LEFT_ONLY.has(frame)) {
        // Left-only brackets are rendered as part of TreeEdge, not as overlay
        continue;
      } else {
        // Regular frames: one bracket around entire subtree
        const rect = subtreeRect(n.id, nodes, children);
        if (!rect) continue;
        const d = framePath(frame, rect);
        if (d) out.push({ id: n.id, d, color });
      }
    }
    return out;
  }, [nodes, edges]);

  if (!paths.length) return null;

  return (
    <ViewportPortal>
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={STROKE_W}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </ViewportPortal>
  );
}

export const FrameOverlay = memo(FrameOverlayView);

export function setFrame(
  nodes: RfNode[],
  id: string,
  frame: FrameType,
): RfNode[] {
  return nodes.map((n) =>
    n.id === id
      ? {
          ...n,
          data: {
            ...n.data,
            raw: {
              ...n.data.raw,
              data: { ...(n.data.raw.data ?? {}), frame },
            },
          },
        }
      : n,
  );
}
