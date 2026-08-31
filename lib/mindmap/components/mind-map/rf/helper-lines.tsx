"use client";

import { ViewportPortal } from "@xyflow/react";
import type { Rect } from "./frames";

export interface HelperLine {
  axis: "h" | "v";
  coord: number;
  start: number;
  end: number;
}

const STROKE = "rgba(0, 113, 227, 0.7)";

export function HelperLines({ lines }: { lines: HelperLine[] }) {
  if (!lines.length) return null;
  return (
    <ViewportPortal>
      <svg
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 9,
        }}
        width={1}
        height={1}
      >
        {lines.map((l, i) =>
          l.axis === "v" ? (
            <line
              key={i}
              x1={l.coord}
              x2={l.coord}
              y1={l.start}
              y2={l.end}
              stroke={STROKE}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : (
            <line
              key={i}
              x1={l.start}
              x2={l.end}
              y1={l.coord}
              y2={l.coord}
              stroke={STROKE}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ),
        )}
      </svg>
    </ViewportPortal>
  );
}

const HIGHLIGHT = 8;
const SNAP = 4;

export function computeHelperLines(
  drag: Rect,
  others: Rect[],
): { lines: HelperLine[]; snap: { dx: number; dy: number } } {
  const lines: HelperLine[] = [];
  let snapDx = 0;
  let snapDy = 0;
  let bestSnapX = SNAP + 1;
  let bestSnapY = SNAP + 1;

  const dragCx = drag.x + drag.w / 2;
  const dragCy = drag.y + drag.h / 2;
  const dragLeft = drag.x;
  const dragRight = drag.x + drag.w;
  const dragTop = drag.y;
  const dragBottom = drag.y + drag.h;

  for (const o of others) {
    const oCx = o.x + o.w / 2;
    const oCy = o.y + o.h / 2;
    const oLeft = o.x;
    const oRight = o.x + o.w;
    const oTop = o.y;
    const oBottom = o.y + o.h;

    const xPairs: [number, number][] = [
      [dragCx, oCx],
      [dragLeft, oLeft],
      [dragRight, oRight],
      [dragLeft, oRight],
      [dragRight, oLeft],
    ];
    for (const [d, t] of xPairs) {
      const diff = Math.abs(d - t);
      if (diff > HIGHLIGHT) continue;
      const yMin = Math.min(dragTop, oTop) - 8;
      const yMax = Math.max(dragBottom, oBottom) + 8;
      lines.push({ axis: "v", coord: t, start: yMin, end: yMax });
      if (diff < bestSnapX) {
        bestSnapX = diff;
        snapDx = t - d;
      }
    }

    const yPairs: [number, number][] = [
      [dragCy, oCy],
      [dragTop, oTop],
      [dragBottom, oBottom],
      [dragTop, oBottom],
      [dragBottom, oTop],
    ];
    for (const [d, t] of yPairs) {
      const diff = Math.abs(d - t);
      if (diff > HIGHLIGHT) continue;
      const xMin = Math.min(dragLeft, oLeft) - 8;
      const xMax = Math.max(dragRight, oRight) + 8;
      lines.push({ axis: "h", coord: t, start: xMin, end: xMax });
      if (diff < bestSnapY) {
        bestSnapY = diff;
        snapDy = t - d;
      }
    }
  }

  return {
    lines,
    snap: {
      dx: bestSnapX <= SNAP ? snapDx : 0,
      dy: bestSnapY <= SNAP ? snapDy : 0,
    },
  };
}
