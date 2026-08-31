'use client';

// Showcase of the knowledge bases: the base tree on the left, a preview of the
// selected base on the right. The tree is the same hierarchy (and the same tone
// colours) as the picker — the showcase answers the one question a flat list
// can't: "what's actually inside this base?".
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/api';
import { buildTree, type TreeNode } from '../base-tree';
import type { BaseTab } from '../base-picker';
import type { CatalogRecord, ColumnDef } from '@/lib/datasource/types';
import { toneColor } from '@/lib/tone';
import { IconFolder, IconFile } from '../icons';
import { useToast } from '../ui';
import { useLang } from '../lang-provider';
import type { Lang } from '@/lib/i18n';
import styles from './bases.module.css';

// Co-located UI strings. Ukrainian is the source language; ru/en are natural
// translations. Keys map to a single user-facing string each. DB field keys,
// column labels, owner values, URLs and CSS classes stay untranslated.
const S = {
  uk: {
    loadListError: 'Не вдалося завантажити список баз',
    loadBaseError: 'Не вдалося завантажити базу',
    builtinTag: 'вбудована',
    back: 'Таблиця',
    title: 'Вітрина баз',
    navLabel: 'Бази знань',
    emptyList: 'Поки що немає жодної бази.',
    choosePrompt: 'Оберіть базу зліва.',
    openBase: 'Відкрити базу',
    records: 'Записів',
    columns: 'Колонок',
    author: 'Автор',
    authorCatalog: 'каталог',
    authorTeam: 'команда',
    created: 'Створена',
    loading: 'Завантажуємо…',
    emptyBase: 'База поки порожня — рядків немає.',
    moreRows: (n: number) => `…і ще ${n} рядків`,
  },
  ru: {
    loadListError: 'Не удалось загрузить список баз',
    loadBaseError: 'Не удалось загрузить базу',
    builtinTag: 'встроенная',
    back: 'Таблица',
    title: 'Витрина баз',
    navLabel: 'Базы знаний',
    emptyList: 'Пока нет ни одной базы.',
    choosePrompt: 'Выберите базу слева.',
    openBase: 'Открыть базу',
    records: 'Записей',
    columns: 'Колонок',
    author: 'Автор',
    authorCatalog: 'каталог',
    authorTeam: 'команда',
    created: 'Создана',
    loading: 'Загружаем…',
    emptyBase: 'База пока пуста — строк нет.',
    moreRows: (n: number) => `…и ещё ${n} строк`,
  },
  en: {
    loadListError: 'Failed to load the list of bases',
    loadBaseError: 'Failed to load the base',
    builtinTag: 'built-in',
    back: 'Table',
    title: 'Bases showcase',
    navLabel: 'Knowledge bases',
    emptyList: 'No bases yet.',
    choosePrompt: 'Select a base on the left.',
    openBase: 'Open base',
    records: 'Records',
    columns: 'Columns',
    author: 'Author',
    authorCatalog: 'catalog',
    authorTeam: 'team',
    created: 'Created',
    loading: 'Loading…',
    emptyBase: 'This base is empty — no rows yet.',
    moreRows: (n: number) => `…and ${n} more rows`,
  },
} as const;

// how much of the base the preview shows — enough to recognise it, not to read it
const PREVIEW_ROWS = 8;
const PREVIEW_COLS = 4;

// per-language date locale for the "created" date
const DATE_LOCALE: Record<Lang, string> = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-US' };

interface Preview {
  columns: ColumnDef[];
  records: CatalogRecord[];
  total: number;
}

function formatDate(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(DATE_LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BasesShowcase() {
  const toast = useToast();
  const { lang } = useLang();
  const t = S[lang];
  const [tabs, setTabs] = useState<BaseTab[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);

  const { roots } = useMemo(() => buildTree(tabs), [tabs]);
  const current = tabs.find((t) => t.id === selected);

  useEffect(() => {
    apiJson<{ bases?: BaseTab[] }>('/api/bases')
      .then((body) => {
        const list = body.bases ?? [];
        setTabs(list);
        // pre-select the first base so the panel isn't empty on arrival
        if (list.length) setSelected((prev) => prev ?? list[0].id);
      })
      .catch((e) => toast(e instanceof Error ? e.message : t.loadListError));
  }, [toast, t]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setPreview(null);
    apiJson<{ columns?: ColumnDef[]; records?: CatalogRecord[]; total?: number }>(
      `/api/records?base=${encodeURIComponent(selected)}`,
    )
      .then((body) => {
        const records = body.records ?? [];
        setPreview({ columns: body.columns ?? [], records, total: body.total ?? records.length });
      })
      .catch((e) => toast(e instanceof Error ? e.message : t.loadBaseError))
      .finally(() => setLoading(false));
  }, [selected, toast, t]);

  const renderNode = useCallback(
    (node: TreeNode, depth: number) => (
      <div key={node.id}>
        <button
          type="button"
          className={`${styles.node} ${node.id === selected ? styles.nodeActive : ''}`}
          style={{ paddingLeft: `${10 + depth * 16}px`, ['--tone']: toneColor(node.tone) } as CSSProperties}
          onClick={() => setSelected(node.id)}
        >
          <span className={styles.tone} aria-hidden="true" />
          <span className={styles.icon} aria-hidden="true">
            {node.children.length ? <IconFolder size={14} /> : <IconFile size={14} />}
          </span>
          <span className={styles.name}>{node.name}</span>
          {node.builtin && <span className={styles.tag}>{t.builtinTag}</span>}
        </button>
        {node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    ),
    [selected, t],
  );

  // long-text columns don't fit a narrow preview — they live on the record card
  const previewColumns = (preview?.columns ?? []).filter((c) => c.type !== 'long-text').slice(0, PREVIEW_COLS);
  const previewRows = (preview?.records ?? []).slice(0, PREVIEW_ROWS);
  const created = formatDate(current?.createdAt, lang);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← {t.back}</Link>
        <h1>{t.title}</h1>
        <span className={styles.count}>{tabs.length}</span>
      </header>

      <div className={styles.layout}>
        <nav className={styles.list} aria-label={t.navLabel}>
          {roots.length === 0 && <p className={styles.none}>{t.emptyList}</p>}
          {roots.map((n) => renderNode(n, 0))}
        </nav>

        <section className={styles.panel} aria-live="polite">
          {!current && <p className={styles.none}>{t.choosePrompt}</p>}

          {current && (
            <>
              <div className={styles.panelHead}>
                <span className={styles.panelDot} style={{ background: toneColor(current.tone) }} aria-hidden="true" />
                <h2>{current.name}</h2>
                <Link href={`/?base=${encodeURIComponent(current.id)}`} className={styles.open}>
                  {t.openBase}
                </Link>
              </div>

              <dl className={styles.meta}>
                <div>
                  <dt>{t.records}</dt>
                  <dd>{loading ? '…' : preview?.total ?? 0}</dd>
                </div>
                <div>
                  <dt>{t.columns}</dt>
                  <dd>{loading ? '…' : preview?.columns.length ?? 0}</dd>
                </div>
                <div>
                  <dt>{t.author}</dt>
                  <dd>{current.builtin ? t.authorCatalog : current.owner ?? t.authorTeam}</dd>
                </div>
                {created && (
                  <div>
                    <dt>{t.created}</dt>
                    <dd>{created}</dd>
                  </div>
                )}
              </dl>

              {!loading && preview && preview.columns.length > 0 && (
                <ul className={styles.chips}>
                  {preview.columns.map((c) => (
                    <li key={c.key}>{c.label}</li>
                  ))}
                </ul>
              )}

              {loading && <p className={styles.none}>{t.loading}</p>}

              {!loading && preview && previewRows.length === 0 && (
                <p className={styles.none}>{t.emptyBase}</p>
              )}

              {!loading && previewRows.length > 0 && (
                <>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {previewColumns.map((c) => (
                          <th key={c.key}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r) => (
                        <tr key={String(r.id)}>
                          {previewColumns.map((c) => (
                            <td key={c.key}>{r[c.key] === undefined || r[c.key] === null ? '' : String(r[c.key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(preview?.total ?? 0) > previewRows.length && (
                    <p className={styles.more}>{t.moreRows((preview?.total ?? 0) - previewRows.length)}</p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
