import { getCustomStore, canAccessBase, type BinContents, type BinRecord, type CustomBase, type CustomStore } from './customStore';

// The recycle bin is private: a person sees, restores and empties only the
// deleted bases and rows accessible to them (own / shared / ownerless), never
// someone else's.
//
// This lives here because the rule used to be implemented once, in the web bin
// route, while the MCP connector called the raw store directly and simply had
// no check — so any token holder could read every teammate's deleted base names
// and permanently wipe the whole team's trash (emptyBin() with no scope deletes
// every flagged base AND the live rows inside it). Both callers now go through
// these helpers, so the two cannot drift apart again.

export interface AccessibleBin {
  store: CustomStore;
  bases: CustomBase[];
  records: BinRecord[];
}

export async function accessibleBinFor(me: string | null): Promise<AccessibleBin> {
  const store = getCustomStore();
  const bin: BinContents = await store.listBin();
  const all = await store.listAllBases();
  const access = new Map<string, boolean>();
  // a binned base is not in listAllBases, so both lists feed the access map
  for (const b of [...all, ...bin.bases]) access.set(b.id, canAccessBase(b, me));
  return {
    store,
    bases: bin.bases.filter((b) => access.get(b.id)),
    records: bin.records.filter((r) => access.get(r.baseId)),
  };
}

/** Narrow an accessible bin to one base, or keep all of it when scopeId is null. */
export function scopeBin(bin: AccessibleBin, scopeId: string | null) {
  if (!scopeId) return { bases: bin.bases, records: bin.records };
  return {
    bases: bin.bases.filter((b) => b.id === scopeId),
    records: bin.records.filter((r) => r.baseId === scopeId),
  };
}

/** Permanently delete, one accessible base id at a time — never a blanket wipe. */
export async function emptyScope(
  store: CustomStore,
  scoped: { bases: CustomBase[]; records: BinRecord[] },
): Promise<{ bases: number; records: number }> {
  const ids = new Set<string>([...scoped.bases.map((b) => b.id), ...scoped.records.map((r) => r.baseId)]);
  let bases = 0;
  let records = 0;
  for (const id of ids) {
    const res = await store.emptyBin({ baseId: id });
    bases += res.bases;
    records += res.records;
  }
  return { bases, records };
}

/** May `me` restore this binned base? */
export function binHasBase(bin: AccessibleBin, id: string): boolean {
  return bin.bases.some((b) => b.id === id);
}

/** May `me` restore rows of this base? The base itself may still be alive. */
export async function canRestoreRows(bin: AccessibleBin, me: string | null, baseId: string): Promise<boolean> {
  if (binHasBase(bin, baseId)) return true;
  const base = await bin.store.getBase(baseId);
  return Boolean(base && canAccessBase(base, me));
}
