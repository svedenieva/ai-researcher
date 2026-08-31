"use client";

import { createContext, useContext } from "react";
import type { Shape, BorderStyle, BranchType } from "./style-ops";
import type { FrameType } from "./frames";

export type MenuSection = "all" | "style" | "shape" | "text" | "emoji";

export interface MindMapActions {
  editable: boolean;
  beginEdit: (nodeId: string) => void;
  commitEdit: (nodeId: string, label: string) => void;
  cancelEdit: () => void;
  editingId: string | null;
  selectedId: string | null;
  dropTarget: { id: string; mode: "child" | "before" | "after" } | null;
  focusBranchId: string | null;
  openMenuForNode?: (nodeId: string, section?: MenuSection) => void;
  // Node operations (from toolbar popover)
  addChildTo?: (nodeId: string) => void;
  addSiblingTo?: (nodeId: string) => void;
  addSiblingBeforeTo?: (nodeId: string) => void;
  addRootNode?: () => void;
  deleteNodeById?: (nodeId: string) => void;
  deleteKeepChildrenOf?: (nodeId: string) => void;
  insertParentOf?: (nodeId: string) => void;
  detachToRootOf?: (nodeId: string) => void;
  reorderSiblingOf?: (nodeId: string, dir: "up" | "down") => void;
  indentNodeOf?: (nodeId: string) => void;
  outdentNodeOf?: (nodeId: string) => void;
  setTextColorOf?: (nodeId: string, color: string) => void;
  setLineColorOf?: (nodeId: string, color: string) => void;
  resetLineColorOf?: (nodeId: string) => void;
  setBgColorOf?: (nodeId: string, color: string) => void;
  toggleBoldOf?: (nodeId: string) => void;
  toggleItalicOf?: (nodeId: string) => void;
  setFontSizeOf?: (nodeId: string, size: number) => void;
  setFontFamilyOf?: (nodeId: string, fontFamily: string) => void;
  setShapeOf?: (nodeId: string, shape: Shape) => void;
  setLinkOf?: (nodeId: string, url: string) => void;
  setBorderStyleOf?: (nodeId: string, borderStyle: BorderStyle) => void;
  setBranchTypeOf?: (nodeId: string, branchType: BranchType) => void;
  setFrameOf?: (nodeId: string, frame: FrameType) => void;
  toggleTagOf?: (nodeId: string, tag: string) => void;
  toggleIconOf?: (nodeId: string, icon: string) => void;
  toggleExpandOf?: (nodeId: string) => void;
  toggleFocusMode?: () => void;
  copyStyle?: () => void;
  pasteStyle?: () => void;
  selectAllChildren?: () => void;
  commitResize?: () => void;
  /** Snapshot of currently-selected node IDs. Sticky union (survives RF's
   * spurious single-id deselect on resize-handle pointerdown), pruned of
   * ghost IDs against the live store. */
  getSelectedIds?: () => Set<string>;
  resetPositionOf?: (nodeId: string) => void;
  relayoutAfterEdit?: () => void;
  // Tier actions (stenographer)
  approveNode?: (nodeId: string) => void;
  rejectNode?: (nodeId: string) => void;
  approveAll?: () => void;
  // Task actions
  toggleTaskOf?: (nodeId: string) => void;
  toggleTaskStatusOf?: (nodeId: string) => void;
  setTaskAssigneeOf?: (
    nodeId: string,
    user: { id: string; name: string; email?: string } | null,
  ) => void;
}

export const MindMapCtx = createContext<MindMapActions | null>(null);

export function useMindMapActions(): MindMapActions {
  const v = useContext(MindMapCtx);
  if (!v) {
    return {
      editable: false,
      beginEdit: () => {},
      commitEdit: () => {},
      cancelEdit: () => {},
      editingId: null,
      selectedId: null,
      dropTarget: null,
      focusBranchId: null,
      openMenuForNode: () => {},
    };
  }
  return v;
}
