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
import styles from './bases.module.css';

// how much of the base the preview shows — enough to recognise it, not to read it
const PREVIEW_ROWS = 8;
const PREVIEW_COLS = 4;

interface Preview {
  columns: ColumnDef[];
  records: CatalogRecord[];
  total: number;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BasesShowcase() {
  const toast = useToast();
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
      .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося завантажити список баз'));
  }, [toast]);

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
      .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося завантажити базу'))
      .finally(() => setLoading(false));
  }, [selected, toast]);

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
          {node.builtin && <span className={styles.tag}>вбудована</span>}
        </button>
        {node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    ),
    [selected],
  );

  // long-text columns don't fit a narrow preview — they live on the record card
  const previewColumns = (preview?.columns ?? []).filter((c) => c.type !== 'long-text').slice(0, PREVIEW_COLS);
  const previewRows = (preview?.records ?? []).slice(0, PREVIEW_ROWS);
  const created = formatDate(current?.createdAt);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← Таблиця</Link>
        <h1>Вітрина баз</h1>
        <span className={styles.count}>{tabs.length}</span>
      </header>

      <div className={styles.layout}>
        <nav className={styles.list} aria-label="Бази знань">
          {roots.length === 0 && <p className={styles.none}>Поки що немає жодної бази.</p>}
          {roots.map((n) => renderNode(n, 0))}
        </nav>

        <section className={styles.panel} aria-live="polite">
          {!current && <p className={styles.none}>Оберіть базу зліва.</p>}

          {current && (
            <>
              <div className={styles.panelHead}>
                <span className={styles.panelDot} style={{ background: toneColor(current.tone) }} aria-hidden="true" />
                <h2>{current.name}</h2>
                <Link href={`/?base=${encodeURIComponent(current.id)}`} className={styles.open}>
                  Відкрити базу
                </Link>
              </div>

              <dl className={styles.meta}>
                <div>
                  <dt>Записів</dt>
                  <dd>{loading ? '…' : preview?.total ?? 0}</dd>
                </div>
                <div>
                  <dt>Колонок</dt>
                  <dd>{loading ? '…' : preview?.columns.length ?? 0}</dd>
                </div>
                <div>
                  <dt>Автор</dt>
                  <dd>{current.builtin ? 'каталог' : current.owner ?? 'команда'}</dd>
                </div>
                {created && (
                  <div>
                    <dt>Створена</dt>
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

              {loading && <p className={styles.none}>Завантажуємо…</p>}

              {!loading && preview && previewRows.length === 0 && (
                <p className={styles.none}>База поки порожня — рядків немає.</p>
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
                    <p className={styles.more}>…і ще {(preview?.total ?? 0) - previewRows.length} рядків</p>
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
