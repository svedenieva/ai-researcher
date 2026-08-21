// Ceilings on user input. Without them one caller — or one confused model on the
// MCP connector — fills the storage in a single request. Vercel caps a request
// body at ~4.5 MB, which bounds bytes but not row count or nesting depth.
export const MAX_ROWS_PER_REQUEST = 1000;
export const MAX_CELL_CHARS = 64_000;
export const MAX_NAME_CHARS = 200;
export const MAX_DEPTH = 10;

function depthOf(value: unknown, level = 0): number {
  if (level > MAX_DEPTH) return level;
  if (value === null || typeof value !== 'object') return level;
  let deepest = level;
  for (const v of Object.values(value as Record<string, unknown>)) {
    deepest = Math.max(deepest, depthOf(v, level + 1));
    if (deepest > MAX_DEPTH) return deepest;
  }
  return deepest;
}

/** Null when the row is acceptable, otherwise the message to send back. */
export function checkPayload(data: Record<string, unknown>): string | null {
  if (depthOf(data) > MAX_DEPTH) return 'The value is nested too deeply';
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
      return `The value in field "${key}" is longer than ${MAX_CELL_CHARS} characters`;
    }
  }
  return null;
}

export function checkRowCount(n: number): string | null {
  return n > MAX_ROWS_PER_REQUEST ? `At most ${MAX_ROWS_PER_REQUEST} rows can be added at once` : null;
}

export function checkName(name: string): string | null {
  return name.length > MAX_NAME_CHARS ? `The name is longer than ${MAX_NAME_CHARS} characters` : null;
}

// English mirrors of checkPayload/checkRowCount for the MCP tool responses —
// every other failed() string in app/api/mcp/route.ts is English, unlike the
// Russian, user-facing REST error bodies above.
export function checkPayloadEn(data: Record<string, unknown>): string | null {
  if (depthOf(data) > MAX_DEPTH) return 'value is nested too deeply';
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
      return `field "${key}" is longer than ${MAX_CELL_CHARS} characters`;
    }
  }
  return null;
}

export function checkRowCountEn(n: number): string | null {
  return n > MAX_ROWS_PER_REQUEST ? `cannot add more than ${MAX_ROWS_PER_REQUEST} rows at once` : null;
}
