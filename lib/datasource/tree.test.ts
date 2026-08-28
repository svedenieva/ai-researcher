import { describe, it, expect } from 'vitest';
import { descendantsOf, basePath } from './tree';

const N = (id: string, parent: string | null) => ({ id, parent });

describe('basePath — root→node chain for breadcrumbs', () => {
  const items = [N('root', null), N('mid', 'root'), N('leaf', 'mid'), N('other', null)];

  it('returns the chain from the top level down to the node', () => {
    expect(basePath(items, 'leaf').map((n) => n.id)).toEqual(['root', 'mid', 'leaf']);
  });

  it('a top-level node is a single-element path', () => {
    expect(basePath(items, 'root').map((n) => n.id)).toEqual(['root']);
    expect(basePath(items, 'other').map((n) => n.id)).toEqual(['other']);
  });

  it('an unknown id yields an empty path', () => {
    expect(basePath(items, 'nope')).toEqual([]);
  });

  it('is cycle-safe (a parent loop does not hang)', () => {
    const looped = [N('a', 'b'), N('b', 'a')];
    // stops when it revisits a node instead of looping forever
    const ids = basePath(looped, 'a').map((n) => n.id);
    expect(ids).toContain('a');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('descendantsOf (existing, still green)', () => {
  it('lists the subtree of a node', () => {
    const bases = [N('root', null), N('a', 'root'), N('b', 'a'), N('c', null)];
    expect(descendantsOf(bases, 'root').sort()).toEqual(['a', 'b']);
  });
});
