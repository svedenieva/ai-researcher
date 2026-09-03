// ТР-ПИ-03: перед запуском прогона проверяем накопленное. Если по этой теме уже
// есть база (совпадает формулировка или название) в состоянии «закрыта» —
// прогон не запускаем, а показываем накопленное. Матчинг чистый и тестируемый.
import type { CustomBase } from '../datasource/customStore';

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Тема считается «той же», если совпадает формулировка искомого (query) или
    название базы. Возвращает первую подходящую базу и признак «закрыта». */
export function findTopicBase(
  bases: Pick<CustomBase, 'id' | 'name' | 'state' | 'query'>[],
  topic: string,
): { id: string; name: string; closed: boolean } | null {
  const t = norm(topic);
  if (!t) return null;
  for (const b of bases) {
    const byQuery = b.query ? norm(b.query) === t : false;
    const byName = norm(b.name) === t;
    if (byQuery || byName) {
      return { id: b.id, name: b.name, closed: b.state === 'closed' };
    }
  }
  return null;
}
