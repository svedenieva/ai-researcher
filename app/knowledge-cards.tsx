'use client';

import type { CatalogRecord, ColumnDef } from '@/lib/datasource/types';
import { t as tr, type Lang } from '@/lib/i18n';
import { toneColor } from '@/lib/tone';
import styles from './knowledge-cards.module.css';

// ТР-БЗ-01: элементы базы знаний как компактные карточки. Заголовок (название) +
// тип, а блоки «краткое описание» и «инструкция» СВЁРНУТЫ по умолчанию и
// раскрываются независимо (<details>). В свёрнутом виде карточки плотные — их
// помещается много без прокрутки; раскрытие соседние ветви (дерево слева) не
// двигает.
const RE_DESC = /описание|опис|краткое|short|summary|description|вступ|введен/i;
const RE_INSTR = /инструкц|інструкц|instruction|настрой|использ|guide|how/i;
const RE_TYPE = /тип|катего|раздел|вид\b|kind|type/i;

function firstText(record: CatalogRecord, cols: ColumnDef[], re: RegExp): { label: string; value: string } | null {
  for (const c of cols) {
    if (c.key.startsWith('__') || !re.test(`${c.label} ${c.key}`)) continue;
    const v = record[c.key] == null ? '' : String(record[c.key]).trim();
    if (v) return { label: c.label, value: v };
  }
  return null;
}

export default function KnowledgeCards({
  records,
  columns,
  lang,
  tone,
  onOpen,
}: {
  records: CatalogRecord[];
  columns: ColumnDef[];
  lang: Lang;
  tone?: string;
  onOpen: (record: CatalogRecord) => void;
}) {
  const nameKey = columns.find((c) => !c.key.startsWith('__'))?.key ?? 'id';
  const typeCol = columns.find((c) => !c.key.startsWith('__') && RE_TYPE.test(`${c.label} ${c.key}`));
  const accent = tone ? toneColor(tone) : undefined;

  if (!records.length) return <div className={styles.empty}>{tr(lang, 'cardsEmpty' as Parameters<typeof tr>[1])}</div>;

  return (
    <div className={styles.grid} style={accent ? ({ ['--accent']: accent } as React.CSSProperties) : undefined}>
      {records.map((r) => {
        const title = String(r[nameKey] ?? '').trim() || '—';
        const type = typeCol ? String(r[typeCol.key] ?? '').trim() : '';
        const desc = firstText(r, columns, RE_DESC);
        const instr = firstText(r, columns, RE_INSTR);
        return (
          <div key={String(r.id)} className={styles.card}>
            <div className={styles.head}>
              <button type="button" className={styles.title} onClick={() => onOpen(r)} title={title}>
                {title}
              </button>
              {type && <span className={styles.type}>{type}</span>}
            </div>
            {desc && (
              <details className={styles.block}>
                <summary className={styles.summary}>{desc.label}</summary>
                <div className={styles.body}>{desc.value}</div>
              </details>
            )}
            {instr && desc?.value !== instr.value && (
              <details className={styles.block}>
                <summary className={styles.summary}>{instr.label}</summary>
                <div className={styles.body}>{instr.value}</div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
