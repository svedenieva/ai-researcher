"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMindMapStore } from "./store";
import { expandAncestors } from "./tree-nav";

interface SearchPanelProps {
  onSelect: (nodeId: string) => void;
  onClose: () => void;
}

export function SearchPanel({ onSelect, onClose }: SearchPanelProps) {
  const rf = useReactFlow();
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const nodes = useMindMapStore((s) => s.nodes);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter((n) => (n.data?.label ?? "").toLowerCase().includes(q))
      .map((n) => n.id);
  }, [nodes, query]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    setIdx(0);
  }, [query]);

  useEffect(() => {
    if (!matches.length) return;
    const id = matches[idx];

    // If the match sits inside a collapsed subtree, unfold every ancestor so
    // the node actually appears on the canvas, then give layout one frame to
    // settle before we center on it.
    const store = useMindMapStore.getState();
    const expanded = expandAncestors(store.nodes, store.edges, id);
    if (expanded !== store.nodes) {
      store.setGraph(expanded, store.edges, true);
    }

    const center = () => {
      const node = rf.getNode(id);
      if (!node) return;
      const w = node.measured?.width ?? 180;
      const h = node.measured?.height ?? 40;
      rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        duration: 300,
        zoom: Math.max(rf.getZoom(), 0.9),
      });
    };
    // A single rAF is enough when nothing changed; when we just unfolded
    // ancestors, layout needs a tick to reposition the node.
    const t = expanded !== store.nodes ? 260 : 0;
    const handle = window.setTimeout(center, t);
    onSelect(id);
    return () => window.clearTimeout(handle);
  }, [idx, matches, rf, onSelect]);

  const step = (dir: 1 | -1) => {
    if (!matches.length) return;
    setIdx((i) => (i + dir + matches.length) % matches.length);
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "#ffffff",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        border: "1px solid rgba(0,0,0,0.08)",
        minWidth: 280,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Пошук по нодах… (Ctrl+Shift+F)"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          fontSize: 13,
          background: "transparent",
          color: "#1a1a1a",
          minWidth: 160,
        }}
      />
      <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
        {matches.length ? `${idx + 1} / ${matches.length}` : query ? "0 / 0" : ""}
      </span>
      <button
        onClick={() => step(-1)}
        disabled={!matches.length}
        title="Предыдущий (Shift+Enter)"
        style={btnStyle(!matches.length)}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <button
        onClick={() => step(1)}
        disabled={!matches.length}
        title="Наступний (Enter)"
        style={btnStyle(!matches.length)}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <button onClick={onClose} title="Закрити (Esc)" style={btnStyle(false)}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 4,
    border: "1px solid rgba(0,0,0,0.08)",
    background: disabled ? "#f3f4f6" : "#ffffff",
    color: disabled ? "#cbd5e1" : "#374151",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}
