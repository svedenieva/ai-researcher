// MindNode-style magnetism tuning. All values are in flow coords (not screen px).

/**
 * If the final drag distance is inside this radius from the home position,
 * the drop is treated as "snap back" and the node returns to automatic
 * layout (no pin, no reparent). MindNode docs describe the threshold as
 * "a certain distance from the parent" (~40 px in community tests).
 */
export const SNAP_BACK_RADIUS_PX = 40;

/**
 * Hover dwell time before committing `dropTarget`. 40 ms ≈ 2-3 frames at
 * 60 Hz: short enough to feel instant, long enough that flicking the
 * cursor across nodes doesn't flash candidates for one frame each.
 */
export const DWELL_MS = 40;

/** Thickness of the strip above/below a node that triggers sibling-insert. */
export const SIBLING_BAND_PX = 12;

/** Inner rectangle of a node that counts as drop-as-child (50% × 50%). */
export const CHILD_ZONE_FRACTION = 0.5;

/**
 * Drop-zone half-width as a multiple of the dragged node's measured width.
 * 1.5× makes "stay in column" forgiving on x while keeping it strict on y.
 */
export const PHANTOM_X_ZONE_MULT = 1.5;

/**
 * Minimum y-delta before a drag is treated as a deliberate vertical pin
 * rather than within the magnet's snap-back band.
 */
export const Y_OFFSET_THRESHOLD_PX = 10;

/** Vertical gap between sibling slots in multi-select reorder. */
export const GROUP_GAP_PX = 4;

/**
 * Fallback width when a node hasn't been measured yet (matches
 * DEFAULT_NODE_WIDTH in layout-elk.ts).
 */
export const FALLBACK_NODE_WIDTH = 180;

/**
 * Global CSS for the mind-map canvas. Includes the drag-time transition
 * kill-switch (.mind-dragging) — the single biggest perf win on 300+
 * node maps — and focus-mode dimming.
 */
export const TRANSITION_CSS = `
.react-flow__node {
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.react-flow__node.dragging {
  transition: none;
}
.react-flow__edge path {
  transition: d 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
/* While a node is being dragged we disable transitions globally: the
   browser interpolating transform/d for every visible node on every
   frame is the single biggest drag lag cause on maps with 300+ nodes. */
.mind-dragging .react-flow__node,
.mind-dragging .react-flow__edge path {
  transition: none !important;
}
/* Hide the floating toolbar/popover during drag — it overlaps the node
   visually and distracts. Reappears on drag-stop (class is removed in
   onNodeDragStop). */
.mind-dragging .react-flow__node-toolbar {
  display: none !important;
}
@keyframes mind-node-enter {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}
.mind-node-body {
  animation: mind-node-enter 260ms cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: left center;
}
.react-flow__nodesselection-rect,
.react-flow__nodesselection {
  display: none !important;
}
.mind-ants {
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(90deg, var(--ants-color) 50%, transparent 50%) repeat-x top left / 8px 2px,
    linear-gradient(90deg, var(--ants-color) 50%, transparent 50%) repeat-x bottom left / 8px 2px,
    linear-gradient(0deg, var(--ants-color) 50%, transparent 50%) repeat-y top left / 2px 8px,
    linear-gradient(0deg, var(--ants-color) 50%, transparent 50%) repeat-y top right / 2px 8px;
  animation: mind-marching-ants 0.6s linear infinite;
}
@keyframes mind-marching-ants {
  0%   { background-position: 0 0, 0 100%, 0 0, 100% 0; }
  100% { background-position: 16px 0, -16px 100%, 0 -16px, 100% 16px; }
}
.mind-focus-mode .react-flow__node {
  opacity: 0.15;
  transition: opacity 220ms ease, transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.mind-focus-mode .react-flow__node.mind-focused {
  opacity: 1;
}
.mind-focus-mode .react-flow__edge {
  opacity: 0.1;
  transition: opacity 220ms ease;
}
.mind-focus-mode .react-flow__edge.mind-focused-edge {
  opacity: 1;
}
/* <NodeResizeControl variant="Line"> — invisible hit-only zones (12 px
   wide). No visible line; selection halo from mind-node.tsx shows state.
   Cursor still flips to ew-/ns-resize on hover via RF defaults. */
.react-flow__resize-control.line {
  border: none !important;
  background: transparent !important;
}
.react-flow__resize-control.line.left,
.react-flow__resize-control.line.right {
  width: 12px !important;
  transform: translate(-50%, 0) !important;
}
.react-flow__resize-control.line.top,
.react-flow__resize-control.line.bottom {
  height: 12px !important;
  transform: translate(0, -50%) !important;
}
`;
