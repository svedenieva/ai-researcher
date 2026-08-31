import { describe, it, expect } from 'vitest';
import { getCustomStore } from '@/lib/datasource/customStore';
import { AI_SPHERE_BASE, RUNS_FOLDER, RUN_SEED_COLUMNS, listRuns, researchFolder, runName, tidyRuns } from './runs';

const ME = 'runner@example.com';
const OTHER = 'someone@example.com';

async function makeRun(owner: string, topic: string, parent: string | null) {
  return getCustomStore().createBase({
    name: runName(topic, new Date(2026, 7, 21)),
    columns: RUN_SEED_COLUMNS,
    owner,
    parent,
  });
}

describe('runName', () => {
  it('stamps the day and clips a long topic', () => {
    const name = runName('a'.repeat(80), new Date(2026, 0, 5));
    expect(name.startsWith('Исследование: ')).toBe(true);
    expect(name.endsWith('(05.01)')).toBe(true);
    expect(name.length).toBeLessThan(80);
  });
});

describe('researchFolder', () => {
  it('creates the folder once, under AI-сфера, and reuses it', async () => {
    const me = 'folder-once@example.com';
    const a = await researchFolder(me);
    const b = await researchFolder(me);
    expect(a.id).toBe(b.id);
    expect(a.name).toBe(RUNS_FOLDER);
    expect(a.parent).toBe(AI_SPHERE_BASE); // §5.1: filed under AI-сфера, not at the root
  });

  it('migrates an older root-level folder under AI-сфера', async () => {
    const me = 'legacy-folder@example.com';
    // an existing folder from before §5.1, sitting at the root
    const legacy = await getCustomStore().createBase({
      name: RUNS_FOLDER,
      columns: RUN_SEED_COLUMNS,
      owner: me,
      parent: null,
    });
    const folder = await researchFolder(me);
    expect(folder.id).toBe(legacy.id); // same folder, moved not duplicated
    expect(folder.parent).toBe(AI_SPHERE_BASE);
  });

  it('gives each person their own folder', async () => {
    const mine = await researchFolder('one@example.com');
    const theirs = await researchFolder('two@example.com');
    expect(mine.id).not.toBe(theirs.id);
  });
});

describe('listRuns', () => {
  it('finds runs in the folder and older ones still at the root', async () => {
    const me = 'lister@example.com';
    const folder = await researchFolder(me);
    const filed = await makeRun(me, 'в папке', folder.id);
    const loose = await makeRun(me, 'в корне', null);

    const ids = (await listRuns(me)).map((b) => b.id);
    expect(ids).toContain(filed.id);
    expect(ids).toContain(loose.id);
  });

  it('does not list a normal base, nor anyone else\'s runs', async () => {
    const me = 'strict@example.com';
    const folder = await researchFolder(me);
    await makeRun(me, 'мой', folder.id);
    const theirs = await makeRun(OTHER, 'чужой', null);
    const ordinary = await getCustomStore().createBase({
      name: 'Обычная база',
      columns: RUN_SEED_COLUMNS,
      owner: me,
    });

    const ids = (await listRuns(me)).map((b) => b.id);
    expect(ids).not.toContain(theirs.id);
    expect(ids).not.toContain(ordinary.id);
  });
});

describe('tidyRuns', () => {
  it('files loose runs into the folder and leaves normal bases alone', async () => {
    const me = 'tidy@example.com';
    const loose = await makeRun(me, 'бродячий', null);
    const ordinary = await getCustomStore().createBase({ name: 'Не запуск', columns: RUN_SEED_COLUMNS, owner: me });

    expect(await tidyRuns(me)).toBe(1);

    const store = getCustomStore();
    const folder = await researchFolder(me);
    expect((await store.getBase(loose.id))?.parent).toBe(folder.id);
    expect((await store.getBase(ordinary.id))?.parent).toBeNull();
  });

  it('is a no-op the second time', async () => {
    const me = 'twice@example.com';
    await makeRun(me, 'раз', null);
    expect(await tidyRuns(me)).toBe(1);
    expect(await tidyRuns(me)).toBe(0);
  });

  it('never touches another person\'s loose run', async () => {
    const me = 'mine-only@example.com';
    const theirs = await makeRun(ME, 'чужой бродячий', null);
    await makeRun(me, 'свой', null);

    await tidyRuns(me);
    expect((await getCustomStore().getBase(theirs.id))?.parent).toBeNull();
  });
});
