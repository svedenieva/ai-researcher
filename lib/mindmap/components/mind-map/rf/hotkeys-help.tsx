"use client";

import { useEffect } from "react";

interface HotkeysHelpProps {
  open: boolean;
  onClose: () => void;
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";
const ALT = isMac ? "⌥" : "Alt";
const SHIFT = "⇧";

interface Shortcut {
  keys: string;
  desc: string;
}
interface Group {
  title: string;
  items: Shortcut[];
}

const GROUPS: Group[] = [
  {
    title: "Edit",
    items: [
      { keys: "Tab", desc: "Add child" },
      { keys: "Enter", desc: "Add sibling" },
      { keys: "Dbl-click", desc: "Edit label" },
      { keys: "F2", desc: "Edit label" },
      { keys: "⌫ / Del", desc: "Delete (children lift to grandparent)" },
      { keys: `${SHIFT}+⌫`, desc: "Delete with whole subtree (destructive)" },
      { keys: `${ALT}+⌫`, desc: "Delete (keep children) — legacy alias" },
      { keys: `${MOD}+B`, desc: "Bold" },
      { keys: `${MOD}+I`, desc: "Italic" },
    ],
  },
  {
    title: "History & clipboard",
    items: [
      { keys: `${MOD}+Z`, desc: "Undo" },
      { keys: `${MOD}+${SHIFT}+Z`, desc: "Redo" },
      { keys: `${MOD}+Y`, desc: "Redo (alternate)" },
      { keys: `${MOD}+C`, desc: "Copy subtree" },
      { keys: `${MOD}+X`, desc: "Cut subtree" },
      { keys: `${MOD}+V`, desc: "Paste" },
      { keys: `${ALT}+${MOD}+C`, desc: "Copy node style" },
      { keys: `${ALT}+${MOD}+V`, desc: "Paste node style" },
    ],
  },
  {
    title: "Navigation & view",
    items: [
      { keys: "↑ / ↓ / ← / →", desc: "Move selection between nodes" },
      { keys: `${MOD}+A`, desc: "Select all (canvas focus)" },
      { keys: "Esc", desc: "Cancel edit / deselect" },
      { keys: "0", desc: "Collapse to root (or to selected node)" },
      { keys: "1 – 9", desc: "Expand to level N (subtree-scoped if selected)" },
      { keys: "` / ~", desc: "Collapse all to root" },
      { keys: `${MOD}+${SHIFT}+F`, desc: "Search nodes" },
    ],
  },
  {
    title: "Layout",
    items: [
      { keys: `${MOD}+${SHIFT}+0`, desc: "Restructure: clear all manual pins, reflow" },
      { keys: `Ctrl+${MOD}+R`, desc: "Reset selected node's pin to auto-position" },
      { keys: "Drag root", desc: "Move whole map (offset, persists)" },
      { keys: "Drag child", desc: "Personal-touch offset (saves on drop)" },
      { keys: "Hold Alt while drag", desc: "Disable magnetism / no reparent" },
    ],
  },
  {
    title: "Help",
    items: [
      { keys: "?", desc: "Show this dialog" },
    ],
  },
];

export function HotkeysHelp({ open, onClose }: HotkeysHelpProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(20, 20, 28, 0.97)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14,
          maxWidth: 720,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          color: "rgba(255,255,255,0.92)",
          fontSize: 13,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            position: "sticky",
            top: 0,
            background: "rgba(20, 20, 28, 0.97)",
            zIndex: 1,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 15 }}>Keyboard shortcuts</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
              padding: 4,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div
          style={{
            padding: "12px 18px 18px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  color: "rgba(255,255,255,0.5)",
                  margin: "8px 0 6px",
                }}
              >
                {g.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {g.items.map((it) => (
                  <div
                    key={it.keys + it.desc}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "baseline",
                      padding: "3px 0",
                    }}
                  >
                    <kbd
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.9)",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        minWidth: 64,
                        textAlign: "center",
                      }}
                    >
                      {it.keys}
                    </kbd>
                    <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 12 }}>
                      {it.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
