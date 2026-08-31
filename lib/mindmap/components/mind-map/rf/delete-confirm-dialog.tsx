"use client";

import { useEffect, type ReactNode } from "react";

export type DialogLanguage = "ru" | "uk" | "en";

type DeleteConfirmCopy = {
  title: string;
  body: (label: string, keepChildren: boolean) => ReactNode;
  cancel: string;
  confirm: string;
};

const DELETE_CONFIRM_COPY: Record<DialogLanguage, DeleteConfirmCopy> = {
  ru: {
    title: "Удалить узел?",
    body: (label, keepChildren) => (
      <>
        Бот сейчас активно обновляет карту. Удалить «{label}»
        {keepChildren ? " (сохранить дочерние)" : " вместе с дочерними"}? Узел
        попадёт в стоп-лист, и AI не будет его восстанавливать.
      </>
    ),
    cancel: "Отмена",
    confirm: "Удалить",
  },
  uk: {
    title: "Видалити вузол?",
    body: (label, keepChildren) => (
      <>
        Бот зараз активно оновлює карту. Видалити «{label}»
        {keepChildren ? " (зберегти дочірні)" : " разом з дочірніми"}? Вузол
        потрапить у стоп-лист, і AI не відновлюватиме його.
      </>
    ),
    cancel: "Скасувати",
    confirm: "Видалити",
  },
  en: {
    title: "Delete node?",
    body: (label, keepChildren) => (
      <>
        The bot is actively updating the map. Delete “{label}”
        {keepChildren ? " (keep children)" : " together with its subtree"}? It
        will be added to the stop-list and the AI will not re-add it.
      </>
    ),
    cancel: "Cancel",
    confirm: "Delete",
  },
};

interface DeleteConfirmDialogProps {
  label: string;
  keepChildren: boolean;
  language?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function isDialogLanguage(value: string): value is DialogLanguage {
  return value === "ru" || value === "uk" || value === "en";
}

export function DeleteConfirmDialog({
  label,
  keepChildren,
  language,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const lang: DialogLanguage =
    language && isDialogLanguage(language) ? language : "ru";
  const copy = DELETE_CONFIRM_COPY[lang];

  useEffect(() => {
    // Capture phase intercepts Esc/Enter before ReactFlow's own keyboard
    // handlers (which would otherwise delete nodes on Enter).
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onCancel, onConfirm]);

  return (
    <div
      onClick={onCancel}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          color: "#1a1a1a",
          borderRadius: 10,
          padding: "20px 22px",
          minWidth: 320,
          maxWidth: 420,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          {copy.title}
        </div>
        <div style={{ marginBottom: 16, color: "#444" }}>
          {copy.body(label, keepChildren)}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#f5f5f5",
              color: "#1a1a1a",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {copy.cancel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              background: "#ef4444",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
