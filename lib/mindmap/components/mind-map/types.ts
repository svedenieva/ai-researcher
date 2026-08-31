export interface MindMapNode {
  name: string;
  children?: MindMapNode[];
  /**
   * Per-node state: color, lineColor, customColor, customLineColor, frame,
   * customLeft, customTop, shape, fillColor, fontSize, fontWeight, fontStyle,
   * fontFamily, tag, icon, expand, etc. Persisted alongside name so that
   * save→load round-trips retain all per-node customization.
   */
  data?: Record<string, any>;
}
