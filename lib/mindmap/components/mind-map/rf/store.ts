"use client";

import { create } from "zustand";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import type { NodeChange, EdgeChange } from "@xyflow/react";
import type { RfNode, RfEdge } from "./mindmap-to-rf";

const HISTORY_LIMIT = 100;

type Snapshot = { nodes: RfNode[]; edges: RfEdge[] };

interface MindMapStore {
  nodes: RfNode[];
  edges: RfEdge[];
  history: Snapshot[];
  historyIndex: number;

  setGraph: (nodes: RfNode[], edges: RfEdge[], pushHistory?: boolean) => void;
  applyNodeChanges: (changes: NodeChange<RfNode>[]) => void;
  applyEdgeChanges: (changes: EdgeChange<RfEdge>[]) => void;
  commit: () => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  reset: () => void;
}

function cloneSnapshot(nodes: RfNode[], edges: RfEdge[]): Snapshot {
  return {
    nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
    edges: edges.map((e) => ({ ...e })),
  };
}

export const useMindMapStore = create<MindMapStore>((set, get) => ({
  nodes: [],
  edges: [],
  history: [],
  historyIndex: -1,

  setGraph: (nodes, edges, pushHistory = true) => {
    if (pushHistory) {
      const { history, historyIndex } = get();
      const trimmed = history.slice(0, historyIndex + 1);
      trimmed.push(cloneSnapshot(nodes, edges));
      const overflow = Math.max(0, trimmed.length - HISTORY_LIMIT);
      const next = overflow ? trimmed.slice(overflow) : trimmed;
      set({
        nodes,
        edges,
        history: next,
        historyIndex: next.length - 1,
      });
    } else {
      set({ nodes, edges });
    }
  },

  applyNodeChanges: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  applyEdgeChanges: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  commit: () => {
    const { nodes, edges, history, historyIndex } = get();
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(cloneSnapshot(nodes, edges));
    const overflow = Math.max(0, trimmed.length - HISTORY_LIMIT);
    const next = overflow ? trimmed.slice(overflow) : trimmed;
    set({ history: next, historyIndex: next.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return false;
    const snap = history[historyIndex - 1];
    set({
      nodes: snap.nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: snap.edges.map((e) => ({ ...e })),
      historyIndex: historyIndex - 1,
    });
    return true;
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return false;
    const snap = history[historyIndex + 1];
    set({
      nodes: snap.nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: snap.edges.map((e) => ({ ...e })),
      historyIndex: historyIndex + 1,
    });
    return true;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  reset: () =>
    set({ nodes: [], edges: [], history: [], historyIndex: -1 }),
}));
