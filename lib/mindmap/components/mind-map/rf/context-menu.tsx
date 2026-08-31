"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PALETTE } from "./color-ops";
import type { Shape } from "./style-ops";
import { FONT_SIZES, type FontSizeKey, TAG_PRESETS, ICON_PRESETS } from "./style-ops";
import type { FrameType } from "./frames";

export type MenuSection = "all" | "style" | "shape" | "text" | "emoji";

export interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  isRoot: boolean;
  section?: MenuSection;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onEdit: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDelete: () => void;
  onTextColor: (color: string) => void;
  onLineColor: (color: string) => void;
  onResetLineColor: () => void;
  onBackgroundColor: (color: string) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onFontSize: (size: number) => void;
  onShape: (shape: Shape) => void;
  onFrame: (frame: FrameType) => void;
  onToggleTag: (tag: string) => void;
  onToggleIcon: (icon: string) => void;
  onToggleTask?: () => void;
  isTask?: boolean;
}

export function ContextMenu({
  state,
  onClose,
  onEdit,
  onAddChild,
  onAddSibling,
  onDelete,
  onTextColor,
  onLineColor,
  onResetLineColor,
  onBackgroundColor,
  onToggleBold,
  onToggleItalic,
  onFontSize,
  onShape,
  onFrame,
  onToggleTag,
  onToggleIcon,
  onToggleTask,
  isTask,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const t = setTimeout(() => {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const section: MenuSection = state.section ?? "all";
  const wrap: React.CSSProperties = {
    position: "fixed",
    left: state.x,
    top: state.y,
    transform: "translateX(-50%)",
    zIndex: 1000,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    padding: 4,
    fontSize: 13,
    minWidth: 200,
    maxWidth: 280,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  const item: React.CSSProperties = {
    padding: "7px 12px",
    borderRadius: 4,
    cursor: "pointer",
    userSelect: "none",
  };

  const sep: React.CSSProperties = {
    height: 1,
    background: "#f0f0f0",
    margin: "4px 0",
  };

  const group: React.CSSProperties = {
    padding: "6px 12px",
    color: "#6b7280",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const swatchRow: React.CSSProperties = {
    display: "flex",
    gap: 6,
    padding: "4px 12px 8px",
  };

  const swatch = (color: string, onClick: () => void) => (
    <button
      key={color}
      onClick={onClick}
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        background: color,
        border: "1px solid rgba(0,0,0,0.1)",
        cursor: "pointer",
        padding: 0,
      }}
    />
  );

  const hoverItem = (onClick: () => void, children: React.ReactNode) => (
    <div
      style={item}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      onClick={onClick}
    >
      {children}
    </div>
  );

  const showAll = section === "all";
  const showStyle = showAll || section === "style";
  const showShape = showAll || section === "shape";
  const showText = showAll || section === "text";
  const showEmoji = showAll || section === "emoji";

  if (!mounted) return null;
  const body = (
    <div ref={ref} style={wrap} onContextMenu={(e) => e.preventDefault()}>
      {showAll && (
        <>
          {hoverItem(onEdit, "Edit  ⏎")}
          {hoverItem(onAddChild, "Add child  Tab")}
          {hoverItem(onAddSibling, "Add sibling  ⏎")}
          {!state.isRoot && onToggleTask &&
            hoverItem(
              onToggleTask,
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    border: `1.5px solid ${isTask ? "#10B981" : "#94A3B8"}`,
                    background: isTask ? "#10B981" : "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {isTask && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {isTask ? "Convert to regular node" : "Convert to task"}
                <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 11 }}>⇧⌘T</span>
              </span>,
            )}
          {!state.isRoot && hoverItem(onDelete, "Delete  ⌫")}
          <div style={sep} />
        </>
      )}
      {showStyle && (
        <>
      <div style={group}>Text color</div>
      <div style={swatchRow}>
        {PALETTE.map((c) => swatch(c, () => onTextColor(c)))}
      </div>

      <div style={group}>Line color</div>
      <div style={swatchRow}>
        {PALETTE.map((c) => swatch(c, () => onLineColor(c)))}
      </div>
      {hoverItem(onResetLineColor, "Reset line color")}

      <div style={group}>Background</div>
      <div style={swatchRow}>
        {["#ffffff", ...PALETTE].map((c) =>
          swatch(c, () => onBackgroundColor(c)),
        )}
      </div>
        </>
      )}
      {showText && (
        <>
      {showAll && <div style={sep} />}
      <div style={group}>Font</div>
      {hoverItem(onToggleBold, <><b>Bold</b>  ⌘B</>)}
      {hoverItem(onToggleItalic, <><i>Italic</i>  ⌘I</>)}
      <div style={{ ...swatchRow, gap: 4 }}>
        {(Object.keys(FONT_SIZES) as FontSizeKey[]).map((k) => (
          <button
            key={k}
            onClick={() => onFontSize(FONT_SIZES[k])}
            style={{
              padding: "4px 10px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {k}
          </button>
        ))}
      </div>
        </>
      )}
      {showShape && (
        <>
      <div style={group}>Shape</div>
      <div style={{ ...swatchRow, flexWrap: "wrap" }}>
        {(["line", "rectangle", "roundedRectangle", "ellipse", "diamond"] as Shape[]).map((s) => (
          <button
            key={s}
            onClick={() => onShape(s)}
            style={{
              padding: "4px 8px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {s === "roundedRectangle" ? "Rounded" : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div style={group}>Frame</div>
      <div style={{ ...swatchRow, flexWrap: "wrap" }}>
        {(
          [
            ["none", "None"],
            ["underline", "Underline"],
            ["square-bracket", "[ ]"],
            ["curved-bracket", "( )"],
            ["square-bracket-left", "[ "],
            ["curved-bracket-left", "( "],
          ] as [FrameType, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => onFrame(f)}
            style={{
              padding: "4px 8px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {label}
          </button>
        ))}
      </div>
        </>
      )}
      {showEmoji && (
        <>
      <div style={group}>Tags</div>
      <div style={{ ...swatchRow, flexWrap: "wrap" }}>
        {TAG_PRESETS.map((t) => (
          <button
            key={t}
            onClick={() => onToggleTag(t)}
            style={{
              padding: "3px 7px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#fff",
              cursor: "pointer",
              fontSize: 10,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={group}>Icons</div>
      <div style={{ ...swatchRow, flexWrap: "wrap" }}>
        {ICON_PRESETS.map((ic) => (
          <button
            key={ic}
            onClick={() => onToggleIcon(ic)}
            style={{
              padding: "3px 6px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {ic}
          </button>
        ))}
      </div>
        </>
      )}
    </div>
  );
  return createPortal(body, document.body);
}
