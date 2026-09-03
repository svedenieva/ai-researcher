// ТР-БЗ-09: стадии внедрения знания. Пять фиксированных стадий; отдельный вид
// показывает, сколько записей на какой стадии и сколько там времени. «Время»
// честно считается как средний возраст записи с последнего изменения (__updated,
// иначе __created) — точных переходов между стадиями модель не хранит.
import type { CatalogRecord, ColumnDef } from './datasource/types';

export const STAGES = ['изучение', 'внедрение', 'инструкция', 'обучение', 'проверка'] as const;
export type Stage = (typeof STAGES)[number];

const STAGE_SET = new Set<string>(STAGES);
const RE_STAGE_COL = /стад|stage|этап/i;

export interface StageBucket {
  stage: Stage;
  count: number;
  /** средний возраст записей стадии в днях (с последнего изменения) */
  avgDays: number | null;
}
export interface StageReport {
  stageKey: string | null;
  stageLabel: string | null;
  buckets: StageBucket[];
  /** записи без стадии — в отчёт о неполноте */
  noStage: number;
  total: number;
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function ageDays(rec: CatalogRecord, now: number): number | null {
  const raw = (rec as Record<string, unknown>).__updated ?? (rec as Record<string, unknown>).__created;
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now - t) / 86_400_000);
}

/** ключевая колонка стадии: по названию (стадия/этап/stage) или select со
    значениями из набора стадий */
function findStageColumn(columns: ColumnDef[], records: CatalogRecord[]): ColumnDef | null {
  const named = columns.find((c) => !c.key.startsWith('__') && RE_STAGE_COL.test(`${c.label} ${c.key}`));
  if (named) return named;
  return (
    columns.find(
      (c) =>
        !c.key.startsWith('__') &&
        c.type === 'select' &&
        records.some((r) => STAGE_SET.has(norm(r[c.key]))),
    ) ?? null
  );
}

export function stageReport(records: CatalogRecord[], columns: ColumnDef[], now: number = Date.now()): StageReport {
  const col = findStageColumn(columns, records);
  if (!col) return { stageKey: null, stageLabel: null, buckets: STAGES.map((stage) => ({ stage, count: 0, avgDays: null })), noStage: records.length, total: records.length };

  const ages = new Map<Stage, number[]>();
  const counts = new Map<Stage, number>();
  STAGES.forEach((s) => { ages.set(s, []); counts.set(s, 0); });
  let noStage = 0;
  for (const r of records) {
    const v = norm(r[col.key]) as Stage;
    if (!STAGE_SET.has(v)) { noStage += 1; continue; }
    counts.set(v, (counts.get(v) ?? 0) + 1);
    const a = ageDays(r, now);
    if (a !== null) ages.get(v)!.push(a);
  }

  const buckets: StageBucket[] = STAGES.map((stage) => {
    const arr = ages.get(stage)!;
    const avgDays = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    return { stage, count: counts.get(stage) ?? 0, avgDays: avgDays === null ? null : Math.round(avgDays * 10) / 10 };
  });

  return { stageKey: col.key, stageLabel: col.label, buckets, noStage, total: records.length };
}
