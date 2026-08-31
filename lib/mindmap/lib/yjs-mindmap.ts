// Stub for the vendored mind-map canvas (from mindmap-fix). The canvas imports
// only the `Connection` TYPE from here (`import type { Connection }`), which is
// erased at compile time — the real Yjs collaboration module is not needed for
// AI-Researcher's local, prop-driven use. Kept type-identical to the source so
// the vendored files compile unchanged.
export interface Connection {
  id: string;
  from: string; // source node id
  to: string; // target node id
  label?: string;
  curve?: { dx: number; dy: number }; // control-point offset from the straight midpoint
  width?: number;
  color?: string;
}
