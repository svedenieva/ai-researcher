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
  if (depthOf(data) > MAX_DEPTH) return 'Слишком глубокая вложенность значения';
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
      return `Значение в поле «${key}» длиннее ${MAX_CELL_CHARS} символов`;
    }
  }
  return null;
}

export function checkRowCount(n: number): string | null {
  return n > MAX_ROWS_PER_REQUEST ? `За один раз можно добавить не больше ${MAX_ROWS_PER_REQUEST} строк` : null;
}

export function checkName(name: string): string | null {
  return name.length > MAX_NAME_CHARS ? `Название длиннее ${MAX_NAME_CHARS} символов` : null;
}
