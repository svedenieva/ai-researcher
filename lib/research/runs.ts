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

// §5.1: the Researcher doesn't keep a separate tree — its runs live UNDER the
// built-in «AI-сфера» base (id 'ai', see lib/datasource/bases.ts). The runs
// folder is filed there, so opening AI-сфера shows the research beneath it and
// the RAG scope is one tree, not two. 'ai' is a stable built-in id; buildTree
// nests a custom base under it because /api/bases keeps a built-in parent.
export const AI_SPHERE_BASE = 'ai';

// A run base starts with just these; Claude adds the columns that fit the
// question. The folder carries the same pair so the merged view is readable.
export const RUN_SEED_COLUMNS: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text', sortable: true },
  // WHERE the fact came from, as a category — so the base can be sorted and
  // grouped by source (all the Reddit rows together, all the X rows, etc.),
  // separately from «Источники» which holds the actual link.
  {
    key: 'платформа',
    label: 'Платформа',
    type: 'select',
    sortable: true,
    filterable: true,
    order: ['Официальный сайт', 'Reddit', 'Twitter / X', 'YouTube', 'Форум', 'Медиа', 'Другое'],
    badge: true,
    badgeVariant: {
      'Официальный сайт': 'blue',
      'Reddit': 'amber',
      'Twitter / X': 'teal',
      'YouTube': 'red',
      'Форум': 'grey',
      'Медиа': 'green',
      'Другое': 'grey',
    },
  },
  // The verbatim sentence from the source that backs the row. Inventing a
  // plausible link is easy; inventing a quote that survives a search of the
  // page is much harder — and checking one costs a reader seconds instead of
  // an article. This is what makes the human check cheap enough to actually
  // happen; it is not, and must not be sold as, automatic fact-checking.
  { key: 'цитата', label: 'Цитата', type: 'long-text' },
  { key: 'источники', label: 'Источники', type: 'long-text' },
];

/** Name given to a run base — also how older, unfiled runs are recognised. */
export const RUN_PREFIX = 'Исследование:';

export function runName(topic: string, when: Date): string {
  const stamp = `${String(when.getDate()).padStart(2, '0')}.${String(when.getMonth() + 1).padStart(2, '0')}`;
  return `${RUN_PREFIX} ${topic.slice(0, 48)} (${stamp})`;
}

/** The caller's runs folder, created on first use — always filed under AI-сфера.
    An older folder that still sits at the root is migrated there in passing. */
export async function researchFolder(me: string | null): Promise<CustomBase> {
  const store = getCustomStore();
  const mine = await store.listBases(me);
  const found = mine.find((b) => b.name === RUNS_FOLDER && b.owner === me);
  if (found) {
    if (found.parent !== AI_SPHERE_BASE) {
      return (await store.moveBase(found.id, AI_SPHERE_BASE)) ?? found;
    }
    return found;
  }
  return store.createBase({ name: RUNS_FOLDER, columns: RUN_SEED_COLUMNS, parent: AI_SPHERE_BASE, owner: me });
}

/** Runs already filed in the folder, plus older ones still loose at the root. */
export async function listRuns(me: string | null): Promise<CustomBase[]> {
  const store = getCustomStore();
  const mine = await store.listBases(me);
  const folder = mine.find((b) => b.name === RUNS_FOLDER && b.owner === me);
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
