"use client";

import { useEffect, useRef } from "react";
import { useMindMapStore } from "./store";
import { layoutElk } from "./layout-elk";
import { filterCollapsed } from "./tree-nav";
import type { RfNode, RfEdge } from "./mindmap-to-rf";

interface AutoLayoutOpts {
  enabled: boolean;
  /** Must be stable (useCallback) — identity changes re-trigger the effect. */
  onLaidOut: (nodes: RfNode[], edges: RfEdge[]) => void;
}

/**
 * Re-runs layoutElk when any node's measured dimensions change outside an
 * active drag/resize gesture. Subscribes to the zustand store (RF mirrors
 * NodeChange[] back via onNodesChange → applyNodeChanges).
 */
export function useAutoLayout({ enabled, onLaidOut }: AutoLayoutOpts) {
  const trigger = useMindMapStore((s) => makeMeasuredKey(s.nodes));
  // ELK is async; a faster second run can resolve before the first — drop stale.
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const cur = useMindMapStore.getState();
    if (cur.nodes.length === 0) return;
    // Drag/resize handlers commit final positions themselves; running layout
    // mid-gesture would clobber the live drag and snap the node back to its
    // auto-position. Bail until the gesture ends.
    if (cur.nodes.some((n) => n.dragging || n.resizing)) return;
    const mySeq = ++seqRef.current;
    const visible = filterCollapsed(cur.nodes, cur.edges);
    layoutElk(visible.nodes, visible.edges).then((laid) => {
      if (mySeq !== seqRef.current) return;
      const posMap = new Map(laid.nodes.map((n) => [n.id, n.position]));
      const merged = cur.nodes.map((n) => {
        const pos = posMap.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
      onLaidOut(merged, cur.edges);
    });
  }, [enabled, trigger, onLaidOut]);
}

function makeMeasuredKey(nodes: RfNode[]): string {
  const parts: string[] = [];
  for (const n of nodes) {
    const w = Math.round(n.measured?.width ?? 0);
    const h = Math.round(n.measured?.height ?? 0);
    parts.push(`${n.id}:${w}x${h}`);
  }
  return parts.join("|");
}
