// The base "tone" (sage/teal/blue/amber) resolved to its theme-aware colour
// token from globals.css. Falls back to sage for anything unexpected.
const TONES = new Set(['sage', 'teal', 'blue', 'amber']);

export function toneColor(tone: string | undefined | null): string {
  return `var(--tone-${tone && TONES.has(tone) ? tone : 'sage'})`;
}
