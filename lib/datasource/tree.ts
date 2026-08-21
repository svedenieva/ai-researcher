import type { CustomBase } from './customStore';

// One cycle-safe walk of the base tree.
//
// This was written out twice, byte for byte, in the same route file — and
// neither copy guarded against cycles. A base whose parent chain loops back on
// itself (reachable because the move guard and the walker disagree on what
// "the tree" is) sent the walk into infinite recursion: RangeError, caught far
// away, and the user got somebody else's data instead of their base.
export function descendantsOf(bases: Pick<CustomBase, 'id' | 'parent'>[], id: string): string[] {
  const kids = new Map<string, string[]>();
  for (const b of bases) {
    if (!b.parent) continue;
    kids.set(b.parent, [...(kids.get(b.parent) ?? []), b.id]);
  }
  const out: string[] = [];
  // `seen` starts with the root so a child pointing back at it is a cycle too
  const seen = new Set<string>([id]);
  const walk = (node: string) => {
    for (const child of kids.get(node) ?? []) {
      if (seen.has(child)) continue; // already visited — a loop, not a branch
      seen.add(child);
      out.push(child);
      walk(child);
    }
  };
  walk(id);
  return out;
}
