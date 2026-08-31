"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  Handle,
  Position,
  NodeToolbar,
  NodeResizeControl,
  ResizeControlVariant,
  type NodeProps,
  type OnResize,
} from "@xyflow/react";
import type { RfNode } from "./mindmap-to-rf";
import { branchColor } from "./mindmap-to-rf";
import { useMindMapActions } from "./mind-map-context";
import { NodePopover } from "./node-popover";
import { useMindMapStore } from "./store";
import { TaskAssignee } from "./task-assignee";
import { patchRaw } from "./style-ops";

const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  done: { bg: "#dcfce7", fg: "#166534" },
  "in progress": { bg: "#dbeafe", fg: "#1e40af" },
  todo: { bg: "#f3f4f6", fg: "#374151" },
  blocked: { bg: "#fee2e2", fg: "#991b1b" },
  question: { bg: "#fef3c7", fg: "#92400e" },
  idea: { bg: "#f3e8ff", fg: "#6b21a8" },
  important: { bg: "#fce7f3", fg: "#9d174d" },
  review: { bg: "#e0f2fe", fg: "#075985" },
};

function MindNodeView({ id, data, selected }: NodeProps<RfNode>) {
  const isRoot = data.depth === 0;
  const raw = data.raw.data ?? {};
  const customLineColor = (raw.lineColor as string | undefined) ?? undefined;
  const customTextColor = (raw.color as string | undefined) ?? undefined;
  const customFill = (raw.fillColor as string | undefined) ?? undefined;
  const fontWeight =
    (raw.fontWeight as string | undefined) ?? (isRoot ? "600" : "500");
  const fontStyle = (raw.fontStyle as string | undefined) ?? "normal";
  const fontSize = (raw.fontSize as number | undefined) ?? (isRoot ? 17 : 14);
  // When a node picks a custom font, append the emoji fallback stack so its
  // emoji still resolve (a bare custom font wouldn't inherit the body stack).
  const rawFontFamily = raw.fontFamily as string | undefined;
  const fontFamily = rawFontFamily
    ? `${rawFontFamily}, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`
    : undefined;
  const shape = (raw.shape as string | undefined) ?? "roundedRectangle";
  // Tracks whether the author explicitly chose a shape (e.g. via MindNode
  // import or the shape picker) — distinct from the default "roundedRectangle"
  // we apply to un-styled nodes. When explicit, the renderer draws a visible
  // border in the branch colour even without a fill, so imported topics show
  // the rounded-rect outline that matches the original MindNode rendering.
  const hasExplicitShape = typeof raw.shape === "string";
  const borderStyle = (raw.borderStyle as string | undefined) ?? "none";
  const userWidth =
    typeof raw.userWidth === "number" ? (raw.userWidth as number) : undefined;
  const userHeight =
    typeof raw.userHeight === "number" ? (raw.userHeight as number) : undefined;
  const tags = (raw.tag as string[] | undefined) ?? [];
  const link = (raw.link as string | undefined) ?? "";
  const icons = (raw.icon as string[] | undefined) ?? [];
  const isTask = raw.task === true;
  const taskStatus = (raw.taskStatus as string | undefined) ?? "open";
  const taskId = raw.taskId as string | undefined;
  const taskAssigneeId = raw.ownerUserId as string | undefined;
  const taskAssigneeName = raw.ownerName as string | undefined;
  const noteText = (raw.note as string | undefined) ?? undefined;
  const customBorderColor =
    (raw.borderColor as string | undefined) ?? undefined;
  const branchC = branchColor(data.branchIndex);
  const color = customLineColor ?? branchC;
  // MindNode style: transparent background by default (like original)
  const defaultFill = "transparent";
  const textColor = customTextColor ?? "var(--mm-node-text)";
  const actions = useMindMapActions();
  // Transient interaction state is injected into `data.raw.data` by the
  // parent's `nodes` useMemo, so reading from props is cheap and doesn't
  // couple every node to dropTarget/selectedId churn via context (which
  // would bypass React.memo and re-render all 300+ memoized nodes).
  // editingId/selectedId/dropMode are ALL injected into raw via the
  // parent's `nodes` useMemo. Reading from props is cheap and keeps the
  // `actions` context value reference-stable (which avoids cascade
  // re-renders of every node via useContext). If you read from
  // `actions.editingId` directly, you'll get a stale value because we
  // intentionally omit transient deps from the actions useMemo.
  const isEditing = raw._isEditing === true;
  const isActive = raw._isSelected === true;
  // Presence: remote collaborators currently on this node (injected by the
  // parent's `nodes` useMemo from the Yjs Awareness channel).
  const presence =
    (raw._presence as Array<{ id: string; name: string; image?: string; color: string }> | undefined) ?? [];
  const dropTargetMode =
    raw._dropMode === "child" ||
    raw._dropMode === "before" ||
    raw._dropMode === "after"
      ? (raw._dropMode as "child" | "before" | "after")
      : null;
  const isDropChild = dropTargetMode === "child";
  // `hasChildren` and task-progress are precomputed ONCE by the parent
  // (RfMindMapInner) in its `nodes` useMemo and passed via `data.raw.data`.
  // The previous implementation subscribed every node to `s.nodes` and
  // `s.edges` (whole arrays) and ran an O(N·D) descendant walk per node on
  // every store write → O(N²·D) per mutation for 300+ node maps. That was
  // the #1 drag-lag cause.
  const hasChildren = raw._hasChildren === true;
  const progress = {
    done:
      typeof raw._progressDone === "number" ? (raw._progressDone as number) : 0,
    total:
      typeof raw._progressTotal === "number"
        ? (raw._progressTotal as number)
        : 0,
  };
  const isCollapsed = raw.expand === false;
  const tier = (raw.tier as string | undefined) ?? undefined;
  // Pinned = either legacy absolute (customLeft/Top, kept readable for
  // imported MindNode files) or the live offset model (offsetX/Y). New
  // pins write only offsetX/Y, but the reset-button must show for both.
  const hasCustomPos =
    (typeof raw.customLeft === "number" &&
      typeof raw.customTop === "number") ||
    (typeof raw.offsetX === "number" && raw.offsetX !== 0) ||
    (typeof raw.offsetY === "number" && raw.offsetY !== 0);

  // SVG polygon shapes — rendered as an SVG overlay, not CSS clipPath/transform
  const isSvgShape =
    shape === "diamond" ||
    shape === "triangle" ||
    shape === "parallelogram" ||
    shape === "hexagon";

  // SVG path as percentage-based polygon points: [x%, y%][]
  const svgPolygon: [number, number][] | null = (() => {
    switch (shape) {
      case "diamond":
        return [
          [50, 0],
          [100, 50],
          [50, 100],
          [0, 50],
        ];
      case "triangle":
        return [
          [50, 0],
          [100, 100],
          [0, 100],
        ];
      case "parallelogram":
        return [
          [12, 0],
          [100, 0],
          [88, 100],
          [0, 100],
        ];
      case "hexagon":
        return [
          [25, 0],
          [75, 0],
          [100, 50],
          [75, 100],
          [25, 100],
          [0, 50],
        ];
      default:
        return null;
    }
  })();

  const shapeGeom: React.CSSProperties = (() => {
    switch (shape) {
      case "line":
        // Underline-only — no rounded corners, no full rectangle.
        return { borderRadius: 0 };
      case "rectangle":
        return { borderRadius: 2 };
      case "square":
        return {
          borderRadius: 2,
          aspectRatio: "1 / 1",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        };
      case "pill":
        return { borderRadius: 9999 };
      case "ellipse":
      case "oval":
        return { borderRadius: "50%" };
      case "circle":
        return {
          borderRadius: "50%",
          aspectRatio: "1 / 1",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        };
      case "diamond":
      case "triangle":
      case "parallelogram":
        return { borderRadius: 0 };
      case "roundedRectangle":
      case "auto":
      default:
        // 5 px matches MindNode's gentler corner radius for "topic" cards
        // — 8 was visibly more rounded than the original (user feedback
        // on the 21ref / AiS imports).
        return { borderRadius: 5 };
    }
  })();

  const shapePadding = (() => {
    if (shape === "diamond") return isRoot ? "18px 36px" : "14px 30px";
    if (shape === "hexagon") return isRoot ? "16px 34px" : "12px 26px";
    if (shape === "triangle")
      return isRoot ? "22px 26px 10px" : "18px 22px 6px";
    if (shape === "parallelogram") return isRoot ? "12px 30px" : "8px 20px";
    if (shape === "pill") return isRoot ? "12px 28px" : "8px 20px";
    if (shape === "square" || shape === "circle")
      return isRoot ? "14px" : "10px";
    if (shape === "line")
      // Line-style: tight padding so the rendered node hugs its text and
      // the underline sits right under the text baseline. Horizontal
      // padding extends the rule a few pixels past the text on each side.
      return isRoot ? "0 12px 2px" : "0 8px 1px";
    return isRoot ? "12px 24px" : "8px 16px";
  })();

  const [draft, setDraft] = useState<string>(data.label);
  const [hover, setHover] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  const groupTargetsRef = useRef<Set<string> | null>(null);

  const onNodeResizeStart = () => {
    const ref = actions.getSelectedIds?.() ?? new Set<string>();
    const targets = new Set<string>(ref);
    targets.add(id);
    groupTargetsRef.current = targets;
  };

  const onNodeResize: OnResize = (_evt, params) => {
    const targets = groupTargetsRef.current;
    const store = useMindMapStore.getState();
    const next = store.nodes.map((n) => {
      if (n.id === id) {
        return patchRaw(n, { userWidth: params.width, userHeight: params.height });
      }
      if (!targets || !targets.has(n.id)) return n;
      // Non-dragged selected: also push style.width/height so RF wrapper
      // resizes (NodeResizeControl only sizes its own node natively).
      const patched = patchRaw(n, { userWidth: params.width, userHeight: params.height });
      const curStyle = patched.style ?? {};
      if (curStyle.width === params.width && curStyle.height === params.height) return patched;
      return {
        ...patched,
        style: { ...curStyle, width: params.width, height: params.height },
      };
    });
    store.setGraph(next, store.edges, false);
  };

  const onNodeResizeEnd = () => {
    groupTargetsRef.current = null;
    actions.commitResize?.();
  };

  useEffect(() => {
    if (isEditing) {
      setDraft(data.label);
      requestAnimationFrame(() => {
        const el = editRef.current;
        if (!el) return;
        el.textContent = data.label;
        el.focus();
        if (data.label) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      });
    }
  }, [isEditing, data.label]);

  const baseBorderColor = customBorderColor ?? color;
  const baseBorderWidth = 1.5;
  // MindNode's shape=5 is the default for *every* topic, so an authored
  // shape alone doesn't mean "draw a visible rectangle". The outline is
  // only painted when the author also set border-width > 0 OR a fill — the
  // same gate applies to text-centering, so the variable is hoisted here.
  const shapeRendersOutline =
    hasExplicitShape &&
    shape !== "none" &&
    shape !== "line" && // "line" draws its own border-bottom — handled elsewhere
    !isSvgShape &&
    (
      (typeof raw.borderWidth === "number" && raw.borderWidth > 0) ||
      typeof raw.fillColor === "string" ||
      borderStyle === "solid" ||
      borderStyle === "dotted"
    );

  let borderCss: Pick<
    React.CSSProperties,
    "border" | "borderBottom" | "boxShadow" | "borderLeft" | "opacity"
  > = {};
  if (tier === "etalon" && !isSvgShape) {
    borderCss = {
      border: `1.5px solid #10B981`,
      borderLeft: `3px solid #10B981`,
      boxShadow: "0 0 0 1px rgba(16,185,129,0.15)",
    };
  } else if (tier === "buffer" && !isSvgShape) {
    borderCss = {
      border: `1.5px dashed #F97316`,
      boxShadow: "0 0 0 1px rgba(249,115,22,0.12)",
      opacity: 0.88,
    };
  } else if (shape === "line") {
    // MindNode "Line" shape: text only, with a horizontal underline in the
    // branch / lineColor tone. No rectangle, no fill. Mirrors the look of
    // section labels like "Категории" / "Бэк-Лог / Спринт" in MindNode
    // files. We render at 2 px (slightly thicker than baseBorderWidth) to
    // match MindNode's visual weight.
    const importedLineColor =
      typeof raw.lineColor === "string" ? (raw.lineColor as string) : null;
    borderCss = {
      border: "none",
      borderBottom: `2px solid ${customBorderColor ?? importedLineColor ?? branchC}`,
    };
  } else if (shape === "none") {
    borderCss = { border: "none", boxShadow: "none" };
  } else if (isSvgShape) {
    borderCss = { border: "none" };
  } else if (borderStyle === "animated") {
    borderCss = { border: `${baseBorderWidth}px solid transparent` };
  } else if (borderStyle === "dotted") {
    borderCss = {
      border: `${baseBorderWidth + 0.5}px dashed ${baseBorderColor}`,
    };
  } else if (borderStyle === "solid") {
    borderCss = {
      border: `${baseBorderWidth}px solid ${baseBorderColor}`,
    };
  } else if (customFill) {
    // Node with fill color gets a matching border
    borderCss = {
      border: `${baseBorderWidth}px solid ${customBorderColor ?? baseBorderColor}`,
    };
  } else if (shapeRendersOutline) {
    // Authored shape with a non-zero border-width or an explicit fill.
    // Border colour priority:
    //   1. data.borderColor (user / theme override)
    //   2. data.lineColor (the file's authored branch tone — used by
    //      MindNode itself for the topic outline; keeps imported maps
    //      consistent with the source even when our branch palette
    //      doesn't match MindNode's theme palette exactly)
    //   3. branchC (cycled palette — fallback for editor-created nodes)
    const importedLineColor =
      typeof raw.lineColor === "string" ? (raw.lineColor as string) : null;
    borderCss = {
      border: `${(raw.borderWidth as number) || baseBorderWidth}px solid ${customBorderColor ?? importedLineColor ?? branchC}`,
    };
  } else {
    // MindNode default: no border, transparent background
    borderCss = { border: "none" };
  }

  const nodeFill =
    shape === "none" || shape === "line" || isSvgShape
      ? "transparent"
      : (customFill ?? defaultFill);

  const taskTextDecoration =
    isTask && (taskStatus === "done" || taskStatus === "cancelled")
      ? "line-through"
      : undefined;
  const taskTextColor =
    isTask && (taskStatus === "done" || taskStatus === "cancelled")
      ? "#9ca3af"
      : undefined;
  // Per-depth auto-width budget — used as `maxWidth` only when the user
  // hasn't explicitly resized the node. ELK reads the same per-depth budget
  // in `metricsFor()` for packing. depth 0 → 360, depth 1 → 300, else 240.
  const NODE_AUTO_MAX_WIDTH =
    data.depth === 0 ? 360 : data.depth === 1 ? 300 : 240;
  const hasUserWidth = typeof userWidth === "number";
  const outer: React.CSSProperties = {
    position: "relative",
    padding: shapePadding,
    fontSize,
    fontFamily,
    fontWeight,
    fontStyle,
    color: textColor,
    background: nodeFill,
    display: "flex",
    alignItems: "center",
    // MindNode centers text inside *visible* shaped topics — i.e. those
    // that actually render an outline (border-width > 0) or a fill. Branch-
    // style nodes whose shape is conceptual only (shape=5 without border or
    // fill, e.g. "🟠 2. Управление Информацией") render as plain text and
    // stay left-aligned so the text hugs the branch underline.
    textAlign:
      hasExplicitShape && shape !== "none" && shapeRendersOutline
        ? "center"
        : "left",
    justifyContent:
      hasExplicitShape && shape !== "none" && shapeRendersOutline
        ? "center"
        : "flex-start",
    boxShadow: isRoot ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
    minWidth: 40,
    // When the user has dragged the node to an explicit width, honor it
    // verbatim (no auto cap) so the inner text reflows to fill the new
    // box. Otherwise fall back to the per-depth auto budget.
    ...(hasUserWidth
      ? { width: userWidth as number }
      : { maxWidth: NODE_AUTO_MAX_WIDTH }),
    whiteSpace: "normal",
    wordBreak: "break-word",
    boxSizing: "border-box",
    // Line-shape: keep the node body tight to its text — no extra leading,
    // no min-height inheriting from non-shape paths. The underline rule
    // sits right below the text baseline this way.
    ...(shape === "line"
      ? { lineHeight: 1.2, minHeight: 0 }
      : null),
    ...shapeGeom,
    ...borderCss,
    // `minHeight` (not `height`) — the cell must always grow to fit its
    // text, even if the user previously dragged it shorter. The user-set
    // value is treated as a floor, not a fixed size.
    ...(typeof userHeight === "number" ? { minHeight: userHeight } : {}),
  };

  const committedRef = useRef(false);
  useEffect(() => {
    if (isEditing) committedRef.current = false;
  }, [isEditing]);
  const commit = (withRelayout = false) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const v = (editRef.current?.textContent ?? draft).trim();
    actions.commitEdit(id, v);
    if (withRelayout) actions.relayoutAfterEdit?.();
  };

  const onDoubleClick = () => {
    if (actions.editable) actions.beginEdit(id);
  };

  const showHalo = (selected || isDropChild) && !isEditing;
  const haloRadius = (() => {
    const br = shapeGeom.borderRadius;
    if (typeof br === "number") return Math.max(2, br - 2);
    return br;
  })();
  const haloColor = isDropChild ? "#22c55e" : color;
  let haloStyle: React.CSSProperties | null = null;
  if (showHalo) {
    const base: React.CSSProperties = {
      position: "absolute",
      borderRadius: haloRadius,
      pointerEvents: "none",
      boxSizing: "border-box",
      zIndex: 0,
    };
    haloStyle = isDropChild
      ? {
          ...base,
          inset: -4,
          border: `3px solid ${haloColor}`,
          background: "rgba(34,197,94,0.08)",
        }
      : { ...base, inset: -2, border: `1px solid ${haloColor}` };
  }

  const sibLineStyle: React.CSSProperties | null =
    dropTargetMode === "before" || dropTargetMode === "after"
      ? {
          position: "absolute",
          left: -4,
          right: -4,
          height: 0,
          top: dropTargetMode === "before" ? -8 : undefined,
          bottom: dropTargetMode === "after" ? -8 : undefined,
          borderTop: "2px dashed #0071e3",
          pointerEvents: "none",
          zIndex: 3,
        }
      : null;

  return (
    <div
      style={{
        position: "relative",
        animation: "mind-node-appear 200ms ease-out",
        transformOrigin: "left center",
        // Colored frame in the collaborator's colour when someone else is on
        // this node — the mind-map equivalent of Google Sheets' remote cursor.
        ...(presence.length > 0
          ? { outline: `2px solid ${presence[0].color}`, outlineOffset: 3, borderRadius: 8 }
          : null),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {presence.length > 0 && (
        <div style={{ position: "absolute", top: -13, right: -6, display: "flex", zIndex: 60, pointerEvents: "none" }}>
          {presence.slice(0, 3).map((p, i) => (
            <div
              key={p.id}
              title={`${p.name} — тут`}
              style={{
                width: 20, height: 20, borderRadius: "50%", marginLeft: i === 0 ? 0 : -6,
                border: "2px solid #fff", background: p.color, overflow: "hidden",
                display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.35)",
              }}
            >
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt={p.name} width={20} height={20} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                p.name.trim()[0]?.toUpperCase() ?? "?"
              )}
            </div>
          ))}
        </div>
      )}
      <NodeToolbar
        isVisible={actions.editable && isActive && !isEditing}
        position={Position.Bottom}
        offset={10}
      >
        <NodePopover nodeId={id} isRoot={isRoot} />
      </NodeToolbar>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          opacity: 0,
          pointerEvents: "none",
          background: "transparent",
          border: "none",
          // For "line" shape, anchor the incoming edge to the bottom-left
          // corner so the parent's branch line visually continues into the
          // node's own border-bottom underline (matches MindNode's
          // "section header" rendering where the rule reads as a single
          // horizontal line spanning parent → label → child).
          ...(shape === "line"
            ? { top: "calc(100% - 1px)" }
            : null),
        }}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          opacity: 0,
          pointerEvents: "none",
          background: "transparent",
          border: "none",
          // Mirror — outgoing edge starts at the bottom-right corner so the
          // node's underline flows seamlessly into the child branch line.
          ...(shape === "line"
            ? { top: "calc(100% - 1px)" }
            : null),
        }}
        isConnectable={false}
      />
      {hasChildren && (
        <ExpandBtn
          collapsed={isCollapsed}
          color={color}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleExpandOf?.(id);
          }}
        />
      )}
      {haloStyle && <div style={haloStyle} />}
      {sibLineStyle && <div style={sibLineStyle} />}
      {selected && !isEditing && actions.editable && (
        <>
          {(["top", "right", "bottom", "left"] as const).map((pos) => (
            <NodeResizeControl
              key={pos}
              position={pos}
              variant={ResizeControlVariant.Line}
              minWidth={60}
              minHeight={28}
              color={color}
              onResizeStart={onNodeResizeStart}
              onResize={onNodeResize}
              onResizeEnd={onNodeResizeEnd}
            />
          ))}
        </>
      )}

      {hasCustomPos && (hover || selected) && !isEditing && !isRoot && (
        <div
          className="nodrag nopan"
          onClick={(e) => {
            e.stopPropagation();
            actions.resetPositionOf?.(id);
          }}
          style={{
            position: "absolute",
            left: -7,
            top: -7,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#ffffff",
            border: "1px solid #d1d5db",
            cursor: "pointer",
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            transition: "opacity 150ms ease",
          }}
          title="Reset to auto-layout (Ctrl+Cmd+R)"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6b7280"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="2" x2="12" y2="15" />
            <path d="M5 12l-2 5h18l-2-5" />
            <line x1="12" y1="15" x2="12" y2="22" />
          </svg>
        </div>
      )}
      <div
        className="mind-node-body"
        style={{ ...outer, zIndex: 1 }}
        onDoubleClick={onDoubleClick}
      >
        {/* SVG shape overlay: renders polygon fill + stroke behind text */}
        {isSvgShape && svgPolygon && (
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 0,
            }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polygon
              points={svgPolygon.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={customFill ?? "transparent"}
              stroke={
                borderStyle === "none" || borderStyle === "animated"
                  ? "transparent"
                  : baseBorderColor
              }
              strokeWidth={
                borderStyle === "none" || borderStyle === "animated"
                  ? 0
                  : baseBorderWidth * 2
              }
              strokeDasharray={borderStyle === "dotted" ? "6 4" : undefined}
              strokeLinejoin="miter"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {borderStyle === "animated" && (
          <div
            className="mind-ants"
            style={{ ["--ants-color" as string]: baseBorderColor }}
          />
        )}
        {tier === "etalon" && (
          <span
            style={{
              marginRight: 5,
              position: "relative",
              zIndex: 1,
              color: "#10B981",
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            ✓
          </span>
        )}
        {isTask && (
          <TaskCheckbox
            status={taskStatus}
            editable={actions.editable}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (!actions.editable) return;
              actions.toggleTaskStatusOf?.(id);
            }}
          />
        )}
        {isTask && progress.total > 0 && (
          <TaskProgressBadge done={progress.done} total={progress.total} />
        )}
        {icons.length > 0 && (
          <span style={{ marginRight: 6, position: "relative", zIndex: 1 }}>
            {icons.map((ic, i) => (
              <span key={i} style={{ marginRight: 2 }}>
                {ic}
              </span>
            ))}
          </span>
        )}
        {isEditing ? (
          <div
            ref={editRef}
            contentEditable
            suppressContentEditableWarning
            className="nodrag nopan"
            onInput={(e) => {
              setDraft((e.target as HTMLElement).textContent ?? "");
            }}
            onBlur={() => commit(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                commit();
                (e.target as HTMLElement).blur();
                const isRootNode = data.depth === 0;
                if (isRootNode) actions.addChildTo?.(id);
                else actions.addSiblingTo?.(id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                actions.cancelEdit();
                (e.target as HTMLElement).blur();
              } else if (e.key === "Tab") {
                e.preventDefault();
                e.stopPropagation();
                commit();
                (e.target as HTMLElement).blur();
                actions.addChildTo?.(id);
              } else if (e.metaKey || e.ctrlKey) {
                // Ctrl/Cmd shortcuts bubble to window handler (Ctrl+Z, Ctrl+C etc.)
                // Block browser-native undo/redo in contentEditable — our store handles it
                if (
                  e.key === "z" ||
                  e.key === "Z" ||
                  e.key === "y" ||
                  e.key === "Y"
                ) {
                  e.preventDefault();
                }
              } else {
                // Block propagation for regular typing
                e.stopPropagation();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }}
            style={{
              outline: "none",
              display: "inline-block",
              fontSize: "inherit",
              fontWeight: "inherit",
              fontFamily: "inherit",
              color: "inherit",
              minWidth: 20,
              minHeight: "1em",
              maxWidth: "100%",
              position: "relative",
              zIndex: 1,
              caretColor: textColor,
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              lineHeight: 1.4,
            }}
          />
        ) : (
          <span
            style={{
              display: "inline-flex",
              flexDirection: "column",
              position: "relative",
              zIndex: 1,
              minWidth: 20,
              minHeight: "1em",
              lineHeight: 1.4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              textDecoration: taskTextDecoration,
              color: taskTextColor ?? undefined,
            }}
          >
            <span>{data.label || "\u00A0"}</span>
            {noteText && (
              <span
                style={{
                  fontSize: Math.max(10, fontSize - 3),
                  fontWeight: "normal",
                  fontStyle: "normal",
                  color: "#6b7280",
                  lineHeight: 1.3,
                  marginTop: 2,
                }}
              >
                {noteText}
              </span>
            )}
          </span>
        )}
        {isTask && !isEditing && (
          <TaskAssignee
            editable={actions.editable}
            taskId={taskId}
            assigneeId={taskAssigneeId}
            assigneeName={taskAssigneeName}
            onChange={(user) => actions.setTaskAssigneeOf?.(id, user)}
          />
        )}
        {tags.length > 0 && (
          <span
            style={{
              marginLeft: 8,
              display: "inline-flex",
              gap: 4,
              position: "relative",
              zIndex: 1,
            }}
          >
            {tags.map((t, i) => {
              const palette = TAG_COLORS[t] ?? { bg: "#f3f4f6", fg: "#374151" };
              return (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 10,
                    background: palette.bg,
                    color: palette.fg,
                    fontWeight: 500,
                  }}
                >
                  {t}
                </span>
              );
            })}
          </span>
        )}
        {link && !isEditing && (
          <span
            className="nodrag"
            title={`Відкрити: ${link}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              // Scheme-less links ("drive.google.com/…") would silently no-op
              // or open as a broken relative URL — default them to https.
              const url = /^[a-z][a-z0-9+.-]*:/i.test(link) ? link : `https://${link}`;
              const w = window as unknown as { mindmap?: { openLink?: (u: string) => void } };
              if (w.mindmap?.openLink) { w.mindmap.openLink(url); return; }
              // Web: a Drive link to another map opens it IN the editor, in a NEW
              // TAB — the editor is single-view, so a same-tab nav would replace
              // the current map; a new tab keeps several maps open at once.
              const m = url.match(/\/d\/([A-Za-z0-9_-]{15,})/) || url.match(/[?&]id=([A-Za-z0-9_-]{15,})/);
              if (m) { window.open(`/open?fileId=${m[1]}`, "_blank", "noopener,noreferrer"); return; }
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            style={{
              marginLeft: 8,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: 6,
              background: "rgba(59,130,246,0.14)",
              color: "#3b82f6",
              cursor: "pointer",
              position: "relative",
              zIndex: 2,
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </span>
        )}
        {tier === "buffer" && actions.editable && (
          <span
            className="nodrag"
            style={{
              marginLeft: 6,
              display: "inline-flex",
              gap: 2,
              position: "relative",
              zIndex: 1,
              flexShrink: 0,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.approveNode?.(id);
              }}
              title="Approve"
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: "1px solid #10B981",
                background: "rgba(16,185,129,0.1)",
                color: "#10B981",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ✓
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.rejectNode?.(id);
              }}
              title="Reject"
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: "1px solid #EF4444",
                background: "rgba(239,68,68,0.08)",
                color: "#EF4444",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ✕
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function ExpandBtn({
  collapsed,
  color,
  onClick,
}: {
  collapsed: boolean;
  color: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const size = 16;
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={collapsed ? "Expand" : "Collapse"}
      className="nodrag"
      style={{
        position: "absolute",
        right: -size - 2,
        top: "50%",
        transform: "translateY(-50%)",
        width: size,
        height: size,
        borderRadius: collapsed ? 8 : 3,
        background: collapsed ? color : "#ffffff",
        border: collapsed ? `1.2px solid ${color}` : "1.2px solid #aaaaaa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 2,
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        transition: "all 180ms ease",
      }}
    >
      {collapsed ? (
        /* Plus icon — expand */
        <svg width={size} height={size} viewBox="0 0 16 16">
          <line
            x1="4.5"
            y1="8"
            x2="11.5"
            y2="8"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="8"
            y1="4.5"
            x2="8"
            y2="11.5"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        /* Minus icon — collapse */
        <svg width={size} height={size} viewBox="0 0 16 16">
          <line
            x1="4.5"
            y1="8"
            x2="11.5"
            y2="8"
            stroke="#333"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

function TaskCheckbox({
  status,
  editable,
  onClick,
}: {
  status: string;
  editable: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const nextLabel =
    status === "done"
      ? "Done — click to reopen"
      : status === "cancelled"
        ? "Cancelled — click to reopen"
        : "Open — click to mark done";

  const common: React.CSSProperties = {
    marginRight: 8,
    position: "relative",
    zIndex: 1,
    flexShrink: 0,
    width: 16,
    height: 16,
    borderRadius: 4,
    cursor: editable ? "pointer" : "default",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    verticalAlign: "middle",
    background: "transparent",
  };

  if (status === "done") {
    return (
      <button
        className="nodrag nopan"
        onClick={onClick}
        title={nextLabel}
        style={{
          ...common,
          border: "1.5px solid #10B981",
          background: "#10B981",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
    );
  }

  if (status === "cancelled") {
    return (
      <button
        className="nodrag nopan"
        onClick={onClick}
        title={nextLabel}
        style={{
          ...common,
          border: "1.5px solid #cbd5e1",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94A3B8"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </svg>
      </button>
    );
  }

  return (
    <button
      className="nodrag nopan"
      onClick={onClick}
      title={nextLabel}
      style={{
        ...common,
        border: "1.5px solid #94A3B8",
      }}
    />
  );
}

function TaskProgressBadge({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const complete = done === total;
  return (
    <span
      className="nodrag nopan"
      title={`${done} / ${total} subtasks done`}
      style={{
        marginRight: 8,
        marginLeft: -4,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
      }}
    >
      <span
        style={{
          width: 50,
          height: 4,
          borderRadius: 2,
          background: "rgba(0,0,0,0.08)",
          overflow: "hidden",
          display: "inline-block",
        }}
      >
        <span
          style={{
            display: "block",
            width: `${Math.round(pct * 100)}%`,
            height: "100%",
            background: complete ? "#10B981" : "#3b82f6",
            transition: "width 240ms ease",
          }}
        />
      </span>
      <span
        style={{
          fontSize: 10,
          color: "#6b7280",
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {done}/{total}
      </span>
    </span>
  );
}

export const MindNode = memo(MindNodeView);
