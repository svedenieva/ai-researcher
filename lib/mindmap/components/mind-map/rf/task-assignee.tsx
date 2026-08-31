"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface TenantUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
}

interface Props {
  editable: boolean;
  taskId?: string;
  assigneeId?: string;
  assigneeName?: string;
  /** Called with the picked user (or null on unassign) — should update the
   *  node's raw.data fields and re-persist the outline. Picker itself also
   *  fires the PATCH to the tasks API when taskId is present. */
  onChange: (user: TenantUser | null) => void;
}

export function TaskAssignee({ editable, taskId, assigneeId, assigneeName, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<TenantUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open]);

  useEffect(() => {
    if (!open || users) return;
    apiFetch<{ users: TenantUser[] }>("/mind-map/tenant/users")
      .then((r) => setUsers(r.users ?? []))
      .catch(() => setUsers([]));
  }, [open, users]);

  const pick = async (u: TenantUser | null) => {
    setSaving(true);
    try {
      if (taskId) {
        await apiFetch(`/tasks/${taskId}/assignee`, {
          method: "PATCH",
          body: JSON.stringify({ userId: u?.id ?? null }),
        });
      }
      onChange(u);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const filtered = users?.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }) ?? [];

  const initials = (assigneeName ?? "").trim().slice(0, 2).toUpperCase() || "?";

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        className="nodrag nopan"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!editable) return;
          setOpen((v) => !v);
        }}
        title={assigneeName ? `Assigned to ${assigneeName}` : "Assign to…"}
        style={{
          marginLeft: 8,
          height: 20,
          minWidth: 20,
          padding: assigneeId ? "0 8px 0 4px" : 0,
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.08)",
          background: assigneeId ? "#eef2ff" : "#ffffff",
          color: assigneeId ? "#3730a3" : "#6b7280",
          cursor: editable ? "pointer" : "default",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1,
          verticalAlign: "middle",
          whiteSpace: "nowrap",
        }}
      >
        {assigneeId ? (
          <>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#6366f1",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              {initials}
            </span>
            {assigneeName}
          </>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="nodrag nopan"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 30,
            width: 240,
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
            overflow: "hidden",
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск…"
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "none",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              outline: "none",
              fontSize: 12,
              boxSizing: "border-box",
            }}
          />
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {assigneeId && (
              <button
                onClick={() => pick(null)}
                disabled={saving}
                style={rowStyle(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span style={{ color: "#ef4444" }}>Снять назначение</span>
              </button>
            )}
            {users === null ? (
              <div style={{ padding: "12px 10px", fontSize: 12, color: "#6b7280" }}>
                Загружаем…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "12px 10px", fontSize: 12, color: "#6b7280" }}>
                Никого не найдено
              </div>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => pick(u)}
                  disabled={saving}
                  style={rowStyle(u.id === assigneeId)}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#6366f1",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {(u.name ?? u.email ?? "?").trim().slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.name || u.email}
                    </span>
                    {u.email && u.name && (
                      <span style={{ fontSize: 10, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.email}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    border: "none",
    background: active ? "rgba(99,102,241,0.08)" : "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: "inherit",
  };
}
