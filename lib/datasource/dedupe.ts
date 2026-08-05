import type { CatalogRecord } from './types';
import { CATALOG_COLUMNS } from './columns';

// В каталоге одна и та же компания местами заведена дважды — с одним сайтом, но
// разной вертикалью, популярностью и вердиктом. При группировке она попадала в
// две разные группы и выглядела как две компании. Схлопываем такие записи в одну
// при чтении: ключ — сайт (иначе имя), из пары остаётся более «сильная» запись
// по популярности, затем по вердикту, а потерянная вертикаль дописывается к
// оставшейся, чтобы информация не пропадала.

function rank(key: string, value: unknown): number {
  const col = CATALOG_COLUMNS.find((c) => c.key === key);
  if (!col?.order) return Number.MAX_SAFE_INTEGER;
  const i = col.order.indexOf(String(value ?? ''));
  return i === -1 ? col.order.length : i;
}

// Ключ — только имя. По сайту склеивать нельзя: у части записей в url стоит общая
// ссылка (тред reddit, betalist), и тогда в одну строку слипаются разные компании.
function keyOf(r: CatalogRecord): string {
  return String(r.name ?? '').trim().toLowerCase();
}

export function dedupeCompanies(records: CatalogRecord[]): CatalogRecord[] {
  const byKey = new Map<string, CatalogRecord>();
  const order: string[] = [];

  for (const r of records) {
    const key = keyOf(r);
    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, { ...r });
      order.push(key);
      continue;
    }
    // сильнее та, что выше по популярности; при равенстве — по вердикту
    const better =
      rank('pop', r.pop) - rank('pop', kept.pop) ||
      rank('verdict', r.verdict) - rank('verdict', kept.verdict);
    const winner = better < 0 ? { ...r } : kept;
    const loser = better < 0 ? kept : r;

    // вторую классификацию не теряем, но держим в отдельном поле: если дописать
    // её в vertical, в фильтрах и группировке появятся склеенные значения
    if (loser.vertical && loser.vertical !== winner.vertical) {
      winner.vertical_alt = String(loser.vertical);
    }

    byKey.set(key, winner);
  }

  return order.map((k) => byKey.get(k)!);
}
