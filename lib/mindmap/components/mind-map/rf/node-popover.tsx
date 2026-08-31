"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { PALETTE } from "./color-ops";
import {
  FONT_SIZES,
  FONT_FAMILIES,
  BRANCH_TYPES,
  type Shape,
  type BorderStyle,
  type BranchType,
  type FontSizeKey,
  TAG_PRESETS,
  ICON_PRESETS,
} from "./style-ops";
import type { FrameType } from "./frames";
import { useMindMapActions } from "./mind-map-context";
import { useMindMapStore } from "./store";

const ACTIVE_COLOR = "#60a5fa";
const ACTIVE_SHADOW = "0 0 0 2px rgba(96,165,250,0.35)";

function normalizeColor(c: string | undefined | null): string {
  if (!c) return "";
  const s = String(c).trim().toLowerCase();
  if (s === "none" || s === "transparent") return "transparent";
  return s;
}

interface CurrentStyle {
  shape: string;
  borderStyle: string;
  branchType: string;
  frame: string;
  textColor: string;
  lineColor: string;
  fillColor: string;
  fontFamily: string;
  fontSize: number | undefined;
  fontWeight: string;
  fontStyle: string;
  tags: string[];
  icons: string[];
  link: string;
}

type Tab = "actions" | "style" | "shape" | "text" | "emoji" | "link";

interface NodePopoverProps {
  nodeId: string;
  isRoot: boolean;
}

const CARD_W_OPEN = 260;
const PANEL_MAX_HEIGHT = 320;
const EMPTY_RAW: Record<string, unknown> = {};

export function NodePopover({ nodeId, isRoot }: NodePopoverProps) {
  const [hovered, setHovered] = useState<Tab | null>(null);
  const actions = useMindMapActions();
  const raw = useMindMapStore((s) => {
    const n = s.nodes.find((x) => x.id === nodeId);
    return (n?.data.raw.data ?? EMPTY_RAW) as Record<string, unknown>;
  });
  const current: CurrentStyle = {
    shape: (raw.shape as string) ?? "roundedRectangle",
    borderStyle: (raw.borderStyle as string) ?? (isRoot ? "solid" : "none"),
    branchType: (raw.branchType as string) ?? "step",
    frame: (raw.frame as string) ?? "none",
    textColor: normalizeColor(raw.color as string | undefined),
    lineColor: normalizeColor(raw.lineColor as string | undefined),
    fillColor: normalizeColor(raw.fillColor as string | undefined),
    fontFamily: (raw.fontFamily as string) ?? "",
    fontSize: (raw.fontSize as number | undefined) ?? (isRoot ? 18 : 14),
    fontWeight: (raw.fontWeight as string) ?? "",
    fontStyle: (raw.fontStyle as string) ?? "",
    tags: (raw.tag as string[] | undefined) ?? [],
    icons: (raw.icon as string[] | undefined) ?? [],
    link: (raw.link as string | undefined) ?? "",
  };
  // Invisible anchor inside NodeToolbar — used only for position tracking
  const anchorRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | null>(null);

  const active: Tab | null = hovered;

  useLayoutEffect(() => {
    // The previous implementation ran a self-scheduling rAF loop that
    // called getBoundingClientRect() + setAnchorPos() every frame forever
    // (60 Hz layout-thrash + setState). During drag the canvas is already
    // saturated; this competed for the same frame budget. Now we poll
    // but skip setState when the rect is unchanged, so React doesn't
    // re-render the popover 60×/sec for a stationary anchor.
    let raf = 0;
    let lastTop = -1;
    let lastLeft = -1;
    const update = () => {
      const el = anchorRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top !== lastTop || r.left !== lastLeft) {
          lastTop = r.top;
          lastLeft = r.left;
          setAnchorPos({ top: r.top, left: r.left });
        }
      }
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, []);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setHovered(null), 80);
  };

  const fontBase = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  if (!anchorPos || typeof document === "undefined") {
    return <div ref={anchorRef} style={{ width: 0, height: 0 }} />;
  }

  // Compute tabs row width to center portal content on the anchor
  const tabsW = active ? Math.max(CARD_W_OPEN, 180) : 180;

  return (
    <>
      {/* Invisible anchor stays inside NodeToolbar for position tracking */}
      <div ref={anchorRef} style={{ width: 0, height: 0 }} />

      {/* Everything visible is portaled to body — never clipped */}
      {createPortal(
        <div
          style={{
            position: "fixed",
            top: anchorPos.top,
            left: anchorPos.left - tabsW / 2,
            zIndex: 10000,
            pointerEvents: "auto",
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Tabs row */}
          <div
            style={{
              display: "inline-block",
              background: "#1a1a22",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: active ? 0 : 10,
              borderBottomRightRadius: active ? 0 : 10,
              borderBottomWidth: active ? 0 : 1,
              boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
              color: "#fff",
              fontFamily: fontBase,
              minWidth: active ? CARD_W_OPEN : undefined,
              transition: "min-width 200ms ease-out, border-radius 150ms, border-bottom-width 150ms",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, padding: 4 }}>
              <TbBtn title="Actions" onEnter={() => setHovered("actions")} active={active === "actions"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
                </svg>
              </TbBtn>
              <TbBtn title="Style" onEnter={() => setHovered("style")} active={active === "style"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </TbBtn>
              <TbBtn title="Shape" onEnter={() => setHovered("shape")} active={active === "shape"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                </svg>
              </TbBtn>
              <TbBtn title="Text" onEnter={() => setHovered("text")} active={active === "text"}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Aa</span>
              </TbBtn>
              <TbBtn title="Emoji" onEnter={() => setHovered("emoji")} active={active === "emoji"}>
                <span style={{ fontSize: 14 }}>😀</span>
              </TbBtn>
              <TbBtn title="Посилання" onEnter={() => setHovered("link")} active={active === "link"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </TbBtn>
            </div>
          </div>

          {/* Panel (below tabs) */}
          {active && (
            <div
              style={{
                width: Math.max(CARD_W_OPEN, 180) + 2,
                maxHeight: PANEL_MAX_HEIGHT,
                overflowY: "auto",
                padding: "10px 12px",
                background: "#1a1a22",
                border: "1px solid rgba(255,255,255,0.08)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 10,
                boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
                color: "#fff",
                fontFamily: fontBase,
                boxSizing: "border-box",
                marginLeft: -1,
              }}
              onWheel={(e) => e.stopPropagation()}
            >
              {active === "actions" && <ActionsPanel nodeId={nodeId} isRoot={isRoot} actions={actions} />}
              {active === "style" && <StylePanel nodeId={nodeId} actions={actions} current={current} />}
              {active === "shape" && <ShapePanel nodeId={nodeId} actions={actions} current={current} />}
              {active === "text" && <TextPanel nodeId={nodeId} actions={actions} current={current} />}
              {active === "emoji" && <EmojiPanel nodeId={nodeId} actions={actions} current={current} />}
              {active === "link" && <LinkPanel nodeId={nodeId} actions={actions} current={current} />}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Sub panels ────────────────────────────────

type A = ReturnType<typeof useMindMapActions>;

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{children}</div>;
}

function ShapeDropdown({
  value, onChange,
}: { value: Shape; onChange: (s: Shape) => void }) {
  const [open, setOpen] = useState(false);
  const currentLabel = SHAPE_LIST.find(([s]) => s === value)?.[1] ?? "Auto";

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(255,255,255,0.08)",
          cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <ShapeIcon shape={value} />
          {currentLabel}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.12s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 60 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              zIndex: 61,
              maxHeight: 220, overflowY: "auto",
              background: "rgba(20,20,30,0.96)", backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
              padding: 4,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {SHAPE_LIST.map(([s, label]) => {
              const active = value === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onChange(s); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "7px 10px",
                    background: active ? "rgba(99,102,241,0.2)" : "transparent",
                    border: "none", borderRadius: 6,
                    color: active ? "#c7d2fe" : "rgba(255,255,255,0.9)",
                    cursor: "pointer", fontSize: 13, textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <ShapeIcon shape={s} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {active && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "rgba(255,255,255,0.5)",
        marginBottom: 6,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

function Swatch({
  color,
  onClick,
  active,
}: {
  color: string;
  onClick: () => void;
  active?: boolean;
}) {
  const isTransparent = color === "transparent";
  return (
    <button
      onClick={onClick}
      title={isTransparent ? "Transparent" : color}
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        background: isTransparent
          ? "conic-gradient(#888 25%, #ccc 0 50%, #888 0 75%, #ccc 0) 0 0/8px 8px"
          : color,
        border: active
          ? `2px solid ${ACTIVE_COLOR}`
          : "1px solid rgba(255,255,255,0.25)",
        boxShadow: active ? ACTIVE_SHADOW : undefined,
        cursor: "pointer",
        padding: 0,
        position: "relative",
      }}
    >
      {isTransparent && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "#c00",
            fontWeight: 700,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          ⌀
        </span>
      )}
    </button>
  );
}

function Pill({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        border: active
          ? `1.5px solid ${ACTIVE_COLOR}`
          : "1px solid rgba(255,255,255,0.15)",
        borderRadius: 6,
        background: active ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.04)",
        color: "#fff",
        cursor: "pointer",
        fontSize: 11,
        boxShadow: active ? ACTIVE_SHADOW : undefined,
      }}
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 8px",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        color: "#fff",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </div>
  );
}

function ActionsPanel({ nodeId, isRoot, actions }: { nodeId: string; isRoot: boolean; actions: A }) {
  const isTask = useMindMapStore((s) => {
    const n = s.nodes.find((x) => x.id === nodeId);
    return (n?.data.raw.data as Record<string, unknown> | undefined)?.task === true;
  });
  return (
    <div>
      <MenuItem onClick={() => actions.beginEdit(nodeId)}>Edit  ⏎</MenuItem>
      <MenuItem onClick={() => actions.addChildTo?.(nodeId)}>Add child  Tab</MenuItem>
      <MenuItem onClick={() => actions.addSiblingTo?.(nodeId)}>
        {isRoot ? "Add root sibling  ⏎" : "Add sibling  ⏎"}
      </MenuItem>
      <MenuItem onClick={() => actions.addRootNode?.()}>Add new root</MenuItem>
      {!isRoot && (
        <MenuItem onClick={() => actions.toggleTaskOf?.(nodeId)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 13,
                height: 13,
                borderRadius: 3,
                border: `1.5px solid ${isTask ? "#10B981" : "rgba(255,255,255,0.45)"}`,
                background: isTask ? "#10B981" : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isTask && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            {isTask ? "Remove task" : "Mark as task"}
            <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>⇧⌘T</span>
          </span>
        </MenuItem>
      )}
      {/* Delete defaults to "lift children one level" — children of the
          deleted node become children of its grandparent so nested work
          isn't lost. The destructive cascade variant lives below in red
          and is opt-in only (Shift+Delete). */}
      <MenuItem onClick={() => actions.deleteKeepChildrenOf?.(nodeId)}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Delete
          <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>⌫</span>
        </span>
      </MenuItem>
      <MenuItem onClick={() => actions.deleteNodeById?.(nodeId)}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#fca5a5" }}>
          Delete with subtree
          <span style={{ marginLeft: "auto", color: "rgba(252,165,165,0.5)", fontSize: 11 }}>⇧⌫</span>
        </span>
      </MenuItem>
    </div>
  );
}

function StylePanel({
  nodeId,
  actions,
  current,
}: {
  nodeId: string;
  actions: A;
  current: CurrentStyle;
}) {
  return (
    <div>
      <Label>Text color</Label>
      <Row>
        {PALETTE.map((c) => (
          <Swatch
            key={c}
            color={c}
            active={normalizeColor(c) === current.textColor}
            onClick={() => actions.setTextColorOf?.(nodeId, c)}
          />
        ))}
      </Row>
      <Label>Line color</Label>
      <Row>
        {PALETTE.map((c) => (
          <Swatch
            key={c}
            color={c}
            active={normalizeColor(c) === current.lineColor}
            onClick={() => actions.setLineColorOf?.(nodeId, c)}
          />
        ))}
      </Row>
      <MenuItem onClick={() => actions.resetLineColorOf?.(nodeId)}>Reset line color</MenuItem>
      <Label>Background</Label>
      <Row>
        <Swatch
          color="transparent"
          active={current.fillColor === "transparent" || current.fillColor === ""}
          onClick={() => actions.setBgColorOf?.(nodeId, "transparent")}
        />
        {["#ffffff", ...PALETTE].map((c) => (
          <Swatch
            key={c}
            color={c}
            active={normalizeColor(c) === current.fillColor}
            onClick={() => actions.setBgColorOf?.(nodeId, c)}
          />
        ))}
      </Row>
    </div>
  );
}

const SHAPE_LIST: [Shape, string][] = [
  ["auto", "Auto"],
  ["none", "None"],
  ["line", "Line"],
  ["rectangle", "Rectangle"],
  ["square", "Square"],
  ["roundedRectangle", "Rounded"],
  ["pill", "Pill"],
  ["parallelogram", "Parallelogram"],
  ["diamond", "Diamond"],
  ["hexagon", "Hexagon"],
  ["triangle", "Triangle"],
  ["oval", "Oval"],
  ["circle", "Circle"],
];

const FRAME_LIST: [FrameType, string][] = [
  ["underline", "Underline"],
  ["none", "None"],
  ["square-bracket", "Square [ ]"],
  ["curved-bracket", "Curved ( )"],
  ["square-bracket-left", "Square ["],
  ["curved-bracket-left", "Curved ("],
];

function ShapeIcon({ shape }: { shape: Shape }) {
  const s = "#cfcfd4";
  const w = 1.5;
  const common = { fill: "none", stroke: s, strokeWidth: w } as const;
  switch (shape) {
    case "auto":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path
            d="M12 3l2.4 5.6 6 .5-4.6 4 1.4 5.9L12 16l-5.2 3 1.4-5.9-4.6-4 6-.5L12 3z"
            {...common}
          />
        </svg>
      );
    case "none":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <text
            x="12"
            y="16"
            textAnchor="middle"
            fontSize="13"
            fill={s}
            fontFamily="sans-serif"
          >
            Aa
          </text>
        </svg>
      );
    case "line":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <text
            x="12"
            y="13"
            textAnchor="middle"
            fontSize="11"
            fill={s}
            fontFamily="sans-serif"
          >
            Aa
          </text>
          <line x1="3" y1="17" x2="21" y2="17" stroke={s} strokeWidth={w} />
        </svg>
      );
    case "rectangle":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <rect x="3" y="7" width="18" height="10" {...common} />
        </svg>
      );
    case "square":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <rect x="5" y="5" width="14" height="14" {...common} />
        </svg>
      );
    case "roundedRectangle":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <rect x="3" y="7" width="18" height="10" rx="3" {...common} />
        </svg>
      );
    case "pill":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <rect x="3" y="8" width="18" height="8" rx="4" {...common} />
        </svg>
      );
    case "parallelogram":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M7 7h13l-3 10H4z" {...common} strokeLinejoin="round" />
        </svg>
      );
    case "diamond":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M12 3l9 9-9 9-9-9z" {...common} strokeLinejoin="round" />
        </svg>
      );
    case "hexagon":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M8 4h8l4 8-4 8H8l-4-8z" {...common} strokeLinejoin="round" />
        </svg>
      );
    case "triangle":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M12 4l8 16H4z" {...common} strokeLinejoin="round" />
        </svg>
      );
    case "ellipse":
    case "oval":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <ellipse cx="12" cy="12" rx="9" ry="5" {...common} />
        </svg>
      );
    case "circle":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7" {...common} />
        </svg>
      );
  }
}

function FrameIcon({ frame }: { frame: FrameType }) {
  const s = "#cfcfd4";
  const w = 1.5;
  switch (frame) {
    case "underline":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <line x1="4" y1="16" x2="20" y2="16" stroke={s} strokeWidth={w} strokeLinecap="round" />
        </svg>
      );
    case "none":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <rect
            x="4"
            y="7"
            width="16"
            height="10"
            fill="none"
            stroke={s}
            strokeWidth={w}
            strokeDasharray="2 2"
          />
        </svg>
      );
    case "square-bracket":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path
            d="M10 5H6v14h4"
            fill="none"
            stroke={s}
            strokeWidth={w}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "curved-bracket":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path
            d="M11 5c-4 2-4 12 0 14"
            fill="none"
            stroke={s}
            strokeWidth={w}
            strokeLinecap="round"
          />
        </svg>
      );
    case "square-bracket-left":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path
            d="M10 5H6v14h4"
            fill="none"
            stroke={s}
            strokeWidth={w}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="18" y1="12" x2="14" y2="12" stroke={s} strokeWidth={w} strokeDasharray="2 2" />
        </svg>
      );
    case "curved-bracket-left":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path
            d="M11 5c-4 2-4 12 0 14"
            fill="none"
            stroke={s}
            strokeWidth={w}
            strokeLinecap="round"
          />
          <line x1="18" y1="12" x2="14" y2="12" stroke={s} strokeWidth={w} strokeDasharray="2 2" />
        </svg>
      );
  }
}

function ListItem({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  const baseBg = active ? "rgba(96,165,250,0.18)" : "transparent";
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 12,
        color: "#e5e5ea",
        background: baseBg,
        border: active ? `1px solid ${ACTIVE_COLOR}` : "1px solid transparent",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = active
          ? "rgba(96,165,250,0.25)"
          : "rgba(255,255,255,0.08)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = baseBg)}
    >
      <span
        style={{
          width: 22,
          height: 22,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

function ShapePanel({
  nodeId,
  actions,
  current,
}: {
  nodeId: string;
  actions: A;
  current: CurrentStyle;
}) {
  return (
    <div>
      <Label>Shape</Label>
      <ShapeDropdown
        value={(current.shape === "ellipse" ? "oval" : current.shape) as Shape}
        onChange={(s) => actions.setShapeOf?.(nodeId, s)}
      />
      <Label>Border</Label>
      <Row>
        {(
          [
            ["none", "None"],
            ["solid", "Solid"],
            ["dotted", "Dotted"],
            ["animated", "Animated"],
          ] as [BorderStyle, string][]
        ).map(([b, label]) => (
          <Pill
            key={b}
            active={current.borderStyle === b}
            onClick={() => actions.setBorderStyleOf?.(nodeId, b)}
          >
            {label}
          </Pill>
        ))}
      </Row>
      <Label>Branch Type</Label>
      <Row>
        {BRANCH_TYPES.map(({ key, label }) => (
          <Pill
            key={key}
            active={current.branchType === key}
            onClick={() => actions.setBranchTypeOf?.(nodeId, key)}
          >
            {label}
          </Pill>
        ))}
      </Row>
      <Label>Frame</Label>
      <Row>
        {(
          [
            ["none", "None"],
            ["underline", "___"],
          ] as [FrameType, string][]
        ).map(([f, label]) => (
          <Pill key={f} active={current.frame === f} onClick={() => actions.setFrameOf?.(nodeId, f)}>
            {label}
          </Pill>
        ))}
      </Row>
      <Row>
        {(
          [
            ["square-bracket", "[ ]"],
            ["square-bracket-left", "["],
            ["curved-bracket", "( )"],
            ["curved-bracket-left", "("],
          ] as [FrameType, string][]
        ).map(([f, label]) => (
          <Pill key={f} active={current.frame === f} onClick={() => actions.setFrameOf?.(nodeId, f)}>
            {label}
          </Pill>
        ))}
      </Row>
    </div>
  );
}

function TextPanel({
  nodeId,
  actions,
  current,
}: {
  nodeId: string;
  actions: A;
  current: CurrentStyle;
}) {
  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "#2a2a33",
    color: "#e5e5ea",
    fontSize: 12,
    cursor: "pointer",
    outline: "none",
  };
  const inputStyle: React.CSSProperties = {
    ...selectStyle,
    width: 80,
  };
  return (
    <div>
      <Label>Font</Label>
      <Row>
        <Pill
          active={current.fontWeight === "bold"}
          onClick={() => actions.toggleBoldOf?.(nodeId)}
        >
          <b>Bold</b>
        </Pill>
        <Pill
          active={current.fontStyle === "italic"}
          onClick={() => actions.toggleItalicOf?.(nodeId)}
        >
          <i>Italic</i>
        </Pill>
      </Row>
      <Label>Family</Label>
      <div style={{ marginBottom: 8 }}>
        <select
          value={current.fontFamily || ""}
          onChange={(e) => {
            actions.setFontFamilyOf?.(nodeId, e.target.value || "");
          }}
          style={selectStyle}
        >
          <option value="">
            System Default
          </option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.key} value={f.css} style={{ fontFamily: f.css }}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <Label>Size (px)</Label>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          type="number"
          min={8}
          max={96}
          placeholder="px"
          value={current.fontSize}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 8 && v <= 96) {
              actions.setFontSizeOf?.(nodeId, v);
            }
          }}
          style={inputStyle}
        />
        <select
          value={current.fontSize}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v) actions.setFontSizeOf?.(nodeId, v);
          }}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="" disabled>
            Preset…
          </option>
          {(Object.keys(FONT_SIZES) as FontSizeKey[]).map((k) => (
            <option key={k} value={FONT_SIZES[k]}>
              {k} ({FONT_SIZES[k]}px)
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function EmojiPanel({
  nodeId,
  actions,
  current,
}: {
  nodeId: string;
  actions: A;
  current: CurrentStyle;
}) {
  return (
    <div>
      <Label>Tags</Label>
      <Row>
        {TAG_PRESETS.map((t) => (
          <Pill
            key={t}
            active={current.tags.includes(t)}
            onClick={() => actions.toggleTagOf?.(nodeId, t)}
          >
            {t}
          </Pill>
        ))}
      </Row>
      <Label>Icons</Label>
      <Row>
        {ICON_PRESETS.map((ic) => (
          <Pill
            key={ic}
            active={current.icons.includes(ic)}
            onClick={() => actions.toggleIconOf?.(nodeId, ic)}
          >
            {ic}
          </Pill>
        ))}
      </Row>
    </div>
  );
}

// ── Tab button ────────────────────────────────

function TbBtn({
  onEnter,
  active,
  children,
}: {
  title?: string;
  onEnter: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseEnter={onEnter}
      style={{
        width: 32,
        height: 28,
        borderRadius: 7,
        border: "none",
        cursor: "pointer",
        background: active ? "rgba(255,255,255,0.12)" : "transparent",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        transition: "background 0.1s",
      }}
    >
      {children}
    </button>
  );
}

function LinkPanel({
  nodeId,
  actions,
  current,
}: {
  nodeId: string;
  actions: A;
  current: CurrentStyle;
}) {
  const [val, setVal] = useState(current.link);
  // Reflect external changes (remote edit / switching nodes) into the input.
  useEffect(() => setVal(current.link), [current.link, nodeId]);
  const save = useCallback(
    (v: string) => {
      setVal(v);
      actions.setLinkOf?.(nodeId, v);
    },
    [actions, nodeId],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 236 }}>
      <div style={{ fontSize: 11, opacity: 0.6 }}>Посилання на іншу карту або URL</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={val}
          onChange={(e) => save(e.target.value)}
          placeholder="https://drive.google.com/…"
          spellCheck={false}
          autoFocus
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            padding: "7px 9px",
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "#0f0f16",
            color: "#fff",
            outline: "none",
          }}
        />
        {val ? (
          <button
            onClick={() => save("")}
            title="Прибрати посилання"
            style={{
              fontSize: 15,
              lineHeight: 1,
              width: 26,
              height: 30,
              borderRadius: 7,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "#f87171",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      <div style={{ fontSize: 10.5, opacity: 0.5, lineHeight: 1.45 }}>
        {val
          ? "Значок 🔗 зʼявиться на ноді. Клік відкриє Mindmap-карту, решту — у новій вкладці."
          : "Встав посилання — на ноді зʼявиться клікабельний значок 🔗."}
      </div>
    </div>
  );
}
