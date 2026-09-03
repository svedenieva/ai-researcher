// ТР-БД-06: приведение тегов к единому написанию. Разные написания одного тега
// («AI», «a.i.», «Ai») группируются по канонич. ключу, побеждает самое частое
// написание, и в каждой записи теги переписываются на него без дублей.
// Чистая функция — применение (updateRecord) остаётся за маршрутом.
import { splitTags, TAGS_KEY } from '../tags';

export interface TagFix {
  id: string;
  /** новое значение колонки тегов (строка, разделитель — «, ») */
  tags: string;
}

/** ключ, по которому написания считаются «одним тегом»: регистр, пробелы,
    разделители и пунктуация нормализуются, буквы/цифры остаются. */
export function canonKey(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\s_/\\-]+/g, ' ')      // разделители → пробел (machine-learning → machine learning)
    .replace(/[^\p{L}\p{N} ]+/gu, '') // прочая пунктуация убирается (a.i. → ai)
    .replace(/\s+/g, ' ')
    .trim();
}

export function planTagNormalization(rows: Record<string, unknown>[], tagsKey: string = TAGS_KEY): TagFix[] {
  // считаем, как часто встречается каждое написание в пределах канонич. ключа
  const spellings = new Map<string, Map<string, number>>();
  for (const r of rows) {
    for (const t of splitTags(r[tagsKey])) {
      const k = canonKey(t);
      if (!k) continue;
      const m = spellings.get(k) ?? new Map<string, number>();
      m.set(t, (m.get(t) ?? 0) + 1);
      spellings.set(k, m);
    }
  }
  // канонич. написание — самое частое; при равенстве побеждает первое встреченное
  const canon = new Map<string, string>();
  for (const [k, m] of spellings) {
    let best = '';
    let bestN = -1;
    for (const [spell, n] of m) if (n > bestN) { best = spell; bestN = n; }
    canon.set(k, best);
  }
  // переписываем теги каждой записи, где что-то поменялось
  const fixes: TagFix[] = [];
  for (const r of rows) {
    const cur = splitTags(r[tagsKey]);
    if (!cur.length) continue;
    const next: string[] = [];
    const seen = new Set<string>();
    for (const t of cur) {
      const c = canon.get(canonKey(t)) ?? t;
      if (!seen.has(c)) { seen.add(c); next.push(c); }
    }
    const nextStr = next.join(', ');
    if (nextStr !== cur.join(', ')) fixes.push({ id: String(r.id), tags: nextStr });
  }
  return fixes;
}
