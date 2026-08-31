"use client";

import { memo } from "react";
import {
  BaseEdge,
  type EdgeProps,
  useInternalNode,
} from "@xyflow/react";
import type { FrameType } from "./frames";

// X position of the vertical branch trunk, measured from the parent's
// right edge. MUST be LESS than the child's left-offset (EDGE_NODE_SPACING
// in layout-elk.ts, currently 20) — otherwise trunk sits on top of the
// child and the horizontal tail collapses to length 0 (no visible hop
// from trunk into the node). Keeping trunk at ~half the spacing gives
// the MindNode look: short trunk, short tail, both visible.
const TRUNK_OFFSET = 10;
const NODE_RADIUS = 6;
const BRACKET_W = NODE_RADIUS;

function TreeEdgeComponent({
  id,
  source,
  target,
  style,
  markerEnd,
  markerStart,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const sourceW = sourceNode.measured?.width ?? 180;
  const sourceH = sourceNode.measured?.height ?? 44;
  const targetW = targetNode.measured?.width ?? 180;
  const targetH = targetNode.measured?.height ?? 44;

  // Source: right-center of parent
  const sx = sourceNode.internals.positionAbsolute.x + sourceW;
  const sy = sourceNode.internals.positionAbsolute.y + sourceH / 2;

  // Target: use handle bounds for precise left edge, fallback to positionAbsolute
  const targetHandles = targetNode.internals.handleBounds?.target;
  const leftHandle = targetHandles?.[0];
  const tx = leftHandle
    ? targetNode.internals.positionAbsolute.x + leftHandle.x + (leftHandle.width ?? 0) / 2
    : targetNode.internals.positionAbsolute.x;
  const ty = leftHandle
    ? targetNode.internals.positionAbsolute.y + leftHandle.y + (leftHandle.height ?? 0) / 2
    : targetNode.internals.positionAbsolute.y + targetH / 2;

  // For bracket: node visual top/bottom (use handle Y as center reference)
  const nodeTop = targetNode.internals.positionAbsolute.y;
  const nodeBot = targetNode.internals.positionAbsolute.y + targetH;

  // Trunk X: always sits TRUNK_OFFSET px right of the parent. Earlier we
  // anchored trunk near the *target* when pinned, but that produced a
  // very long horizontal leader-line on the parent's centre-Y that ran
  // across the whole map — visually broken. Keeping trunk by the parent
  // gives a short leader + short vertical + long horizontal tail, which
  // matches MindNode's edge geometry for displaced (personal-touch) nodes.
  const tgtData = targetNode.data as Record<string, any> | undefined;
  const trunkX = sx + TRUNK_OFFSET;

  // Bracket the TARGET if it owns a left-bracket frame or inherits one from
  // an ancestor. `_inheritedFrame` is precomputed in rf-mind-map.tsx; it is
  // set on every descendant (including the bracket-bearing node itself) so
  // the bracket renders on the incoming edge of the owner AND propagates
  // down through children and grandchildren.
  const inheritedFrame = tgtData?.raw?.data?._inheritedFrame as FrameType | undefined;
  const ownFrame = tgtData?.raw?.data?.frame as FrameType | undefined;
  const parentFrame: FrameType = inheritedFrame ?? ownFrame ?? "none";

  const srcData = sourceNode.data as Record<string, any> | undefined;
  const targetIsLine = tgtData?.raw?.data?.shape === "line";
  const sourceIsLine = srcData?.raw?.data?.shape === "line";
  // For line-shape ends, snap edge anchor to the node's *visual* bottom
  // (= where border-bottom is painted) instead of trusting the handle
  // bounds. The handle override pins the React Flow handle ~6 px above
  // the bottom edge — fine for hit-testing but it leaves the rendered
  // edge a few pixels above the actual underline. Using nodeBottom
  // directly puts the edge flush with the rule.
  const tyLine = targetIsLine
    ? targetNode.internals.positionAbsolute.y + targetH
    : ty;
  const syLine = sourceIsLine
    ? sourceNode.internals.positionAbsolute.y + sourceH
    : sy;
  // When BOTH ends are line-shape — chain like "категории → Бэк-Лог
  // / Спринт" — the only visually correct path is a perfectly
  // horizontal segment at the underline Y. Source and target handles
  // are both pinned to the bottom corners, but ELK may place them at
  // marginally different Y values (different node heights / layout
  // half-offsets), so we ignore sy and draw both anchors at target Y
  // — that matches MindNode's continuous-rule rendering for line
  // chains. For a non-line parent (e.g. "Коммуникация: СПРИНТ" →
  // "категории") we fall through to the slanted diagonal below so the
  // edge still reads as parent→child rather than a horizontal rule.

  let path: string;

  if (parentFrame === "curved-bracket-left") {
    const nx = tx+3; // push bracket tips into node border
    const bx = nx - BRACKET_W;
    const r = NODE_RADIUS;
    const base = `M ${sx} ${sy} L ${trunkX} ${sy} L ${trunkX} ${ty} L ${bx} ${ty}`;
    const top = `M ${bx} ${ty} L ${bx} ${nodeTop + r} C ${bx} ${nodeTop}, ${nx} ${nodeTop}, ${nx} ${nodeTop}`;
    const bot = `M ${bx} ${ty} L ${bx} ${nodeBot - r} C ${bx} ${nodeBot}, ${nx} ${nodeBot}, ${nx} ${nodeBot}`;
    path = `${base} ${top} ${bot}`;
  } else if (parentFrame === "square-bracket-left") {
    const nx = tx+3;
    const bx = nx - BRACKET_W;
    const base = `M ${sx} ${sy} L ${trunkX} ${sy} L ${trunkX} ${ty} L ${bx} ${ty}`;
    const top = `M ${bx} ${ty} L ${bx} ${nodeTop} L ${nx} ${nodeTop}`;
    const bot = `M ${bx} ${ty} L ${bx} ${nodeBot} L ${nx} ${nodeBot}`;
    path = `${base} ${top} ${bot}`;
  } else if (targetIsLine && sourceIsLine) {
    // Line → line chain. When the two nodes share a baseline (same
    // height after wrap), draw a single horizontal segment at that Y
    // — the cleanest "continuous rule" look. When the source has wrapped
    // to a different height than the target (e.g. user added text to
    // one of them), drop into an L-shape so each anchor lands flush
    // with its own node's underline. The vertical leg sits at the
    // trunk so it doesn't cross either node body.
    if (Math.abs(syLine - tyLine) < 1) {
      path = `M ${sx} ${tyLine} L ${tx} ${tyLine}`;
    } else {
      path = `M ${sx} ${syLine} L ${trunkX} ${syLine} L ${trunkX} ${tyLine} L ${tx} ${tyLine}`;
    }
  } else if (targetIsLine) {
    // Non-line parent → line target. Drop with the trunk to target
    // bottom, then run horizontally into the underline.
    path = `M ${sx} ${sy} L ${trunkX} ${sy} L ${trunkX} ${tyLine} L ${tx} ${tyLine}`;
  } else if (sourceIsLine) {
    // Line parent → non-line child. Leave the source's bottom-right
    // corner cleanly, then drop to the child's centre.
    path = `M ${sx} ${syLine} L ${trunkX} ${syLine} L ${trunkX} ${ty} L ${tx} ${ty}`;
  } else {
    path = `M ${sx} ${sy} L ${trunkX} ${sy} L ${trunkX} ${ty} L ${tx} ${ty}`;
  }

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerEnd={markerEnd}
      markerStart={markerStart}
    />
  );
}

export const TreeEdge = memo(TreeEdgeComponent);
