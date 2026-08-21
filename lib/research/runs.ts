import { getCustomStore, type CustomBase } from '@/lib/datasource/customStore';
import type { ColumnDef } from '@/lib/datasource/types';

// Research runs used to be created at the top level of the tree, and the only
// handle on one lived in React state — so a reload lost it and every abandoned
// run stayed in the root forever, indistinguishable from a real base.
//
// Runs now live in one folder per person. The folder is a normal base, so
// opening it shows every run's rows merged (a parent base displays its
// descendants' rows) — the archive of your research, for free.

export const RUNS_FOLDER = 'Исследования';

// A run base starts with just these; Claude adds the columns that fit the
// question. The folder carries the same pair so the merged view is readable.
export const RUN_SEED_COLUMNS: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text', sortable: true },
  { key: 'источники', label: 'Источники', type: 'long-text' },
];

/** Name given to a run base — also how older, unfiled runs are recognised. */
export const RUN_PREFIX = 'Исследование:';

export function runName(topic: string, when: Date): string {
  const stamp = `${String(when.getDate()).padStart(2, '0')}.${String(when.getMonth() + 1).padStart(2, '0')}`;
  return `${RUN_PREFIX} ${topic.slice(0, 48)} (${stamp})`;
}

/** The caller's runs folder, created on first use. */
export async function researchFolder(me: string | null): Promise<CustomBase> {
  const store = getCustomStore();
  const mine = await store.listBases(me);
  const found = mine.find((b) => b.parent === null && b.name === RUNS_FOLDER && b.owner === me);
  if (found) return found;
  return store.createBase({ name: RUNS_FOLDER, columns: RUN_SEED_COLUMNS, parent: null, owner: me });
}

/** Runs already filed in the folder, plus older ones still loose at the root. */
export async function listRuns(me: string | null): Promise<CustomBase[]> {
  const store = getCustomStore();
  const mine = await store.listBases(me);
  const folder = mine.find((b) => b.parent === null && b.name === RUNS_FOLDER && b.owner === me);
  return mine.filter(
    (b) =>
      (folder && b.parent === folder.id) ||
      (b.parent === null && b.owner === me && b.name.startsWith(RUN_PREFIX)),
  );
}

/** Move older root-level runs into the folder. Returns how many were filed. */
export async function tidyRuns(me: string | null): Promise<number> {
  const store = getCustomStore();
  const mine = await store.listBases(me);
  const loose = mine.filter((b) => b.parent === null && b.owner === me && b.name.startsWith(RUN_PREFIX));
  if (!loose.length) return 0;
  const folder = await researchFolder(me);
  let moved = 0;
  for (const b of loose) {
    if (b.id === folder.id) continue;
    if (await store.moveBase(b.id, folder.id)) moved++;
  }
  return moved;
}
