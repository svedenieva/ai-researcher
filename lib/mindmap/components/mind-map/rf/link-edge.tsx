// A free-form "connection" arrow between two arbitrary nodes (NOT a tree edge).
// Endpoints float to each node's border facing the other node, so the arrow
// looks right in any arrangement (unlike fixed left/right handles). The arc is
// bowed by data.curve (a draggable midpoint offset); it carries an optional
// label and a delete affordance. Interaction callbacks live in edge.data so the
// graph owner (rf-mind-map) persists curve/label/delete via onConnectionsChange.
import { EdgeLabelRenderer, useInternalNode, useReactFlow, type EdgeProps } from "@xyflow/react";
import { memo, useCallback, useRef, useState } from "react";

export type LinkEdgeData = {
  connId: string;
  label?: string;
  curve?: { dx: number; dy: number };
  width?: number;
  color?: string;
  editable?: boolean;
  onCurve?: (connId: string, curve: { dx: number; dy: number }) => void;
  onLabel?: (connId: string, label: string) => void;
  onColor?: (connId: string, color: string) => void;
  onWidth?: (connId: string, width: number) => void;
  onDelete?: (connId: string) => void;
};

const CONN_COLORS = ["#64748b", "#f97316", "#3b82f6", "#22c55e", "#ef4444", "#a855f7"];

/** Point on a node's rectangle border in the direction of (tx,ty). */
function borderPoint(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function LinkEdgeComponent({ id, source, target, data, selected }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const { getZoom } = useReactFlow();
  const d = (data ?? {}) as LinkEdgeData;

  const dragRef = useRef<{ x0: number; y0: number; dx0: number; dy0: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.label ?? "");

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (!d.editable) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = { x0: e.clientX, y0: e.clientY, dx0: d.curve?.dx ?? 0, dy0: d.curve?.dy ?? 0 };
    },
    [d.editable, d.curve],
  );
  const onMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragRef.current;
      if (!st) return;
      // Screen-pixel deltas → flow space: divide by zoom, else the handle drifts
      // 2× at 2× zoom / undershoots when zoomed out.
      const z = getZoom() || 1;
      d.onCurve?.(d.connId, { dx: st.dx0 + (e.clientX - st.x0) / z, dy: st.dy0 + (e.clientY - st.y0) / z });
    },
    [d, getZoom],
  );
  const onUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  if (!s || !t) return null; // endpoint node gone → render nothing (safe)

  const sw = s.measured?.width ?? 0;
  const sh = s.measured?.height ?? 0;
  const tw = t.measured?.width ?? 0;
  const th = t.measured?.height ?? 0;
  const scx = s.internals.positionAbsolute.x + sw / 2;
  const scy = s.internals.positionAbsolute.y + sh / 2;
  const tcx = t.internals.positionAbsolute.x + tw / 2;
  const tcy = t.internals.positionAbsolute.y + th / 2;

  const sp = borderPoint(scx, scy, sw / 2, sh / 2, tcx, tcy);
  const tp = borderPoint(tcx, tcy, tw / 2, th / 2, scx, scy);

  const midX = (sp.x + tp.x) / 2;
  const midY = (sp.y + tp.y) / 2;
  const cx = midX + (d.curve?.dx ?? 0);
  const cy = midY + (d.curve?.dy ?? 0);
  const path = `M ${sp.x},${sp.y} Q ${cx},${cy} ${tp.x},${tp.y}`;

  const color = d.color || "#64748b";
  const width = d.width ?? 2;

  const commitLabel = () => {
    setEditing(false);
    if (draft.trim() !== (d.label ?? "")) d.onLabel?.(d.connId, draft.trim());
  };

  return (
    <>
      <defs>
        <marker id={`mm-arrow-${id}`} markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={color} strokeWidth={Math.max(1.4, width)} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      <path d={path} fill="none" stroke={color} strokeWidth={selected ? width + 1.2 : width} markerEnd={`url(#mm-arrow-${id})`} style={{ pointerEvents: "none" }} />
      {/* wide invisible hit area */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(16, width + 12)}
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
        className="mm-conn-hit"
      />

      {d.editable && (
        <circle
          cx={cx}
          cy={cy}
          r={selected ? 6 : 4}
          fill="#fff"
          stroke={color}
          strokeWidth={2}
          style={{ cursor: "grab", pointerEvents: "all" }}
          className="nodrag nopan"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={(e) => { e.stopPropagation(); setDraft(d.label ?? ""); setEditing(true); }}
        />
      )}

      {/* Label chip / inline editor — above the midpoint */}
      {(d.label || editing) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan" style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${cx}px, ${cy - 18}px)`, pointerEvents: "all", zIndex: 6 }}>
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitLabel(); }
                  if (e.key === "Escape") { setEditing(false); setDraft(d.label ?? ""); }
                }}
                placeholder="підпис…"
                style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 8, border: `1px solid ${color}`, outline: "none", minWidth: 64, background: "var(--mm-panel-bg, #fff)", color: "var(--mm-text, #222)" }}
              />
            ) : (
              <div
                onDoubleClick={(e) => { e.stopPropagation(); if (d.editable) { setDraft(d.label ?? ""); setEditing(true); } }}
                style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 8, border: `1px solid ${color}`, whiteSpace: "nowrap", cursor: d.editable ? "text" : "default", background: "var(--mm-panel-bg, #fff)", color: "var(--mm-text, #222)" }}
              >
                {d.label}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Toolbar — colour / thickness / label / delete — when selected */}
      {selected && d.editable && !editing && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute", transform: `translate(-50%, -50%) translate(${cx}px, ${cy + 18}px)`,
              pointerEvents: "all", zIndex: 7, display: "flex", alignItems: "center", gap: 4,
              padding: "3px 5px", borderRadius: 9, background: "var(--mm-panel-bg, #fff)",
              border: "1px solid var(--mm-control-border, #e2e8f0)", boxShadow: "0 4px 14px rgba(0,0,0,.18)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {CONN_COLORS.map((c) => (
              <button
                key={c}
                onClick={(e) => { e.stopPropagation(); d.onColor?.(d.connId, c); }}
                title="Колір"
                style={{ width: 14, height: 14, borderRadius: "50%", background: c, cursor: "pointer", border: color.toLowerCase() === c ? "2px solid var(--mm-text, #222)" : "1px solid rgba(0,0,0,.15)", padding: 0 }}
              />
            ))}
            <span style={{ width: 1, height: 16, background: "var(--mm-control-border, #e2e8f0)", margin: "0 2px" }} />
            <button onClick={(e) => { e.stopPropagation(); d.onWidth?.(d.connId, Math.max(1, width - 1)); }} title="Тонше" style={tbBtn}>−</button>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--mm-text-muted, #64748b)", minWidth: 10, textAlign: "center" }}>{width}</span>
            <button onClick={(e) => { e.stopPropagation(); d.onWidth?.(d.connId, Math.min(8, width + 1)); }} title="Товще" style={tbBtn}>+</button>
            <span style={{ width: 1, height: 16, background: "var(--mm-control-border, #e2e8f0)", margin: "0 2px" }} />
            <button onClick={(e) => { e.stopPropagation(); setDraft(d.label ?? ""); setEditing(true); }} title="Підпис" style={tbBtn}>✎</button>
            <button onClick={(e) => { e.stopPropagation(); d.onDelete?.(d.connId); }} title="Видалити зв'язок" style={{ ...tbBtn, background: "#ef4444", color: "#fff", border: "none" }}>×</button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const tbBtn: React.CSSProperties = {
  width: 20, height: 20, borderRadius: 6, border: "1px solid var(--mm-control-border, #e2e8f0)",
  background: "var(--mm-btn-bg, #f8fafc)", color: "var(--mm-text, #222)", fontSize: 13, lineHeight: 1,
  cursor: "pointer", display: "grid", placeItems: "center", padding: 0,
};

export const LinkEdge = memo(LinkEdgeComponent);
