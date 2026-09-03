'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@/lib/datasource/types';
import { buildArticle } from '@/lib/article';
import { renderMarkdown } from '@/lib/markdown';
import { recordMode, MODE_KEY, MODE_REFERENCE, MODE_VALUES } from '@/lib/mode';
import { TAGS_KEY } from '@/lib/tags';
import { apiSend } from '@/lib/api';
import { articleToOutline } from '@/lib/mindmap/topicOutline';
import ThemeToggle from '../../../theme-toggle';
import { useLang } from '../../../lang-provider';
import TopicMindMap from './TopicMindMap';
import styles from './article.module.css';

type Rec = Record<string, unknown>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// UI-chrome strings for the reading view, one key per user-facing label.
// Data-driven text (column labels, values, the MODE_REFERENCE tag) is not here.
const S = {
  uk: {
    saving: 'Зберігаю…',
    saved: 'Збережено',
    saveFailed: 'Не вдалося зберегти',
    map: 'Карта',
    article: 'Стаття',
    edit: 'Редагувати',
    done: 'Готово',
    draft: 'Чернетка', toReference: 'В еталон', promoted: 'Переведено в еталон', promoteBlocked: 'Потрібні перевірена цитата і робоче посилання',
    showInBase: 'показати в базі',
    untitled: 'Без назви',
    mode: 'Режим',
    empty: 'У цієї теми поки немає текстового наповнення.',
    sources: 'Джерела',
    quotes: 'Цитати',
    links: 'Посилання',
    fields: 'Поля',
    mdSupported: 'Підтримується Markdown',
    tagsPlaceholder: 'тег, тег, тег',
  },
  ru: {
    saving: 'Сохраняю…',
    saved: 'Сохранено',
    saveFailed: 'Не удалось сохранить',
    map: 'Карта',
    article: 'Статья',
    edit: 'Редактировать',
    done: 'Готово',
    draft: 'Черновик', toReference: 'В эталон', promoted: 'Переведено в эталон', promoteBlocked: 'Нужна проверенная цитата и рабочая ссылка',
    showInBase: 'показать в базе',
    untitled: 'Без названия',
    mode: 'Режим',
    empty: 'У этой темы пока нет текстового наполнения.',
    sources: 'Источники',
    quotes: 'Цитаты',
    links: 'Ссылки',
    fields: 'Поля',
    mdSupported: 'Markdown поддерживается',
    tagsPlaceholder: 'тег, тег, тег',
  },
  en: {
    saving: 'Saving…',
    saved: 'Saved',
    saveFailed: 'Couldn’t save',
    map: 'Map',
    article: 'Article',
    edit: 'Edit',
    done: 'Done',
    draft: 'Draft', toReference: 'To reference', promoted: 'Promoted to reference', promoteBlocked: 'Needs a verified quote and a working link',
    showInBase: 'show in base',
    untitled: 'Untitled',
    mode: 'Mode',
    empty: 'This topic has no text content yet.',
    sources: 'Sources',
    quotes: 'Quotes',
    links: 'Links',
    fields: 'Fields',
    mdSupported: 'Markdown supported',
    tagsPlaceholder: 'tag, tag, tag',
  },
} as const;

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

// A Markdown task line: «- [ ] label» / «- [x] label» (also * and +).
const CHECK_RE = /^(\s*[-*+]\s+)\[([ xX])\](\s.*)$/;

// Flip the checkbox on one line of a checklist's raw text and return the new text.
function toggleChecklistLine(content: string, lineIndex: number): string {
  const lines = content.split(/\r?\n/);
  const m = CHECK_RE.exec(lines[lineIndex] ?? '');
  if (m) {
    const checked = m[2].toLowerCase() === 'x';
    lines[lineIndex] = `${m[1]}[${checked ? ' ' : 'x'}]${m[3]}`;
  }
  return lines.join('\n');
}

// §5.5 follow-up: the reading view becomes editable in place. Read mode is the
// calm article; the «Редактировать» toggle turns the body into a per-field
// editor (every column, by its type). Each field saves on blur via the same
// PATCH /api/records the grid uses — write access is the base-level check the
// server already applied to render this page.
export default function ArticleClient({
  columns,
  record,
  baseId,
  baseName,
}: {
  columns: ColumnDef[];
  record: Rec;
  baseId: string;
  baseName: string;
}) {
  const { lang } = useLang();
  const [rec, setRec] = useState<Rec>(record);
  // read = the calm article, edit = per-field editor, map = the mind-map canvas
  const [view, setView] = useState<'read' | 'edit' | 'map'>('read');
  const editing = view === 'edit';
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const article = useMemo(() => buildArticle(columns, rec), [columns, rec]);
  const { sidebar } = article;
  const hasSidebar =
    sidebar.sources.length > 0 || sidebar.quotes.length > 0 || sidebar.links.length > 0 || sidebar.raw.length > 0;
  const isReference = article.mode === 'reference';

  // the editable fields: the status flag, then every real column (system keys
  // stay hidden, except the «Теги» column which is a normal editable field)
  const fields = useMemo(
    () => columns.filter((c) => !c.key.startsWith('__') || c.key === TAGS_KEY),
    [columns],
  );

  // ТР-ПА-02: перевод «Черновик → Эталон» (гейт по цитате/ссылке — на сервере)
  async function promote() {
    setSave('saving');
    setError(null);
    try {
      const r = await apiSend<{ promoted: number }>('/api/records/promote', 'POST', { base: baseId, ids: [rec.id] });
      if (r.promoted) {
        setRec((x) => ({ ...x, [MODE_KEY]: MODE_REFERENCE }));
        setSave('saved');
        setTimeout(() => setSave('idle'), 1500);
      } else {
        setSave('error');
        setError(S[lang].promoteBlocked);
      }
    } catch (e) {
      setSave('error');
      setError(e instanceof Error ? e.message : S[lang].saveFailed);
    }
  }

  async function commit(key: string, value: string) {
    if (str(rec[key]) === value) return;
    setSave('saving');
    setError(null);
    try {
      await apiSend('/api/records', 'PATCH', { base: baseId, id: rec.id, data: { [key]: value } });
      setRec((r) => ({ ...r, [key]: value }));
      setSave('saved');
      setTimeout(() => setSave('idle'), 1500);
    } catch (e) {
      setSave('error');
      setError(e instanceof Error ? e.message : S[lang].saveFailed);
    }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href={`/?base=${encodeURIComponent(baseId)}`} className={styles.back}>
          <span aria-hidden="true">←</span> {baseName}
        </Link>
        <div className={styles.headerActions}>
          {save === 'saving' && <span className={styles.saveHint}>{S[lang].saving}</span>}
          {save === 'saved' && <span className={styles.saveHint}>{S[lang].saved}</span>}
          {save === 'error' && <span className={styles.saveError}>{error}</span>}
          <button
            type="button"
            className={view === 'map' ? styles.editOn : styles.editBtn}
            onClick={() => setView((v) => (v === 'map' ? 'read' : 'map'))}
          >
            {view === 'map' ? S[lang].article : S[lang].map}
          </button>
          <button
            type="button"
            className={editing ? styles.editOn : styles.editBtn}
            onClick={() => setView((v) => (v === 'edit' ? 'read' : 'edit'))}
          >
            {editing ? S[lang].done : S[lang].edit}
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <div className={styles.head}>
          <div className={styles.badgeRow}>
            <span className={isReference ? styles.modeReference : styles.modeDraft}>
              {isReference ? MODE_REFERENCE : S[lang].draft}
            </span>
            {!isReference && (
              <button type="button" className={styles.promoteBtn} onClick={promote} title={S[lang].toReference}>
                ⇧ {S[lang].toReference}
              </button>
            )}
            {view === 'read' &&
              article.badges.map((b, i) => (
                <Link
                  key={`${b.column}-${i}`}
                  href={`/?base=${encodeURIComponent(baseId)}&${encodeURIComponent(b.column)}=${encodeURIComponent(b.value)}`}
                  className={styles.tag}
                  title={`${b.label}: ${b.value} — ${S[lang].showInBase}`}
                >
                  {b.value}
                </Link>
              ))}
          </div>
          <h1 className={styles.title}>{article.title || S[lang].untitled}</h1>
        </div>

        {view === 'map' ? (
          <TopicMindMap outline={articleToOutline(article)} title={article.title} />
        ) : editing ? (
          <div className={styles.editForm}>
            {/* status flag first — the same pair the grid toggles */}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{S[lang].mode}</span>
              <select
                className={styles.fieldInput}
                value={recordMode(rec)}
                onChange={(e) => commit(MODE_KEY, e.target.value)}
              >
                {MODE_VALUES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            {fields.map((c) => (
              <label key={c.key} className={styles.field}>
                <span className={styles.fieldLabel}>{c.label}</span>
                <FieldEditor col={c} value={str(rec[c.key])} onCommit={(v) => commit(c.key, v)} />
              </label>
            ))}
          </div>
        ) : (
          <div className={hasSidebar ? styles.layout : styles.layoutWide}>
            <article className={styles.sections}>
              {article.sections.length === 0 && (
                <p className={styles.empty}>{S[lang].empty}</p>
              )}
              {article.sections.map((s) =>
                s.kind === 'checklist' ? (
                  <section key={s.key} className={styles.section}>
                    <h2 className={styles.sectionTitle}>{s.heading}</h2>
                    <ul className={styles.checklist}>
                      {s.content.split(/\r?\n/).map((line, i) => {
                        if (line.trim() === '') return null;
                        const m = CHECK_RE.exec(line);
                        if (m) {
                          const checked = m[2].toLowerCase() === 'x';
                          return (
                            <li key={i} className={styles.checkItem}>
                              <input
                                type="checkbox"
                                className={styles.checkInput}
                                checked={checked}
                                onChange={() => commit(s.key, toggleChecklistLine(s.content, i))}
                              />
                              <span className={checked ? styles.checkDone : undefined}>{m[3].trim()}</span>
                            </li>
                          );
                        }
                        // a plain line (no «[ ]») — show it as a bullet, not a box
                        return (
                          <li key={i} className={styles.checkItem}>
                            <span aria-hidden="true" className={styles.checkBox}>•</span>
                            <span>{line.replace(/^\s*[-*+]\s+/, '')}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : (
                  <section key={s.key} className={styles.section}>
                    <h2 className={styles.sectionTitle}>{s.heading}</h2>
                    <div
                      className={styles.prose}
                      // safe: renderMarkdown escapes all input and emits only a
                      // whitelisted tag set with validated hrefs (see lib/markdown)
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(s.content) }}
                    />
                  </section>
                ),
              )}
            </article>

            {hasSidebar && (
              <aside className={styles.rail}>
                {sidebar.sources.length > 0 && (
                  <details className={styles.pop} open>
                    <summary className={styles.popTitle}>{S[lang].sources}</summary>
                    <ul className={styles.popList}>
                      {sidebar.sources.map((src, i) => (
                        <li key={i}>
                          {/^https?:\/\//i.test(src) ? (
                            <a href={src} target="_blank" rel="noreferrer noopener" className={styles.popLink}>
                              {src.replace(/^https?:\/\//, '')}
                            </a>
                          ) : (
                            <span>{src}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {sidebar.quotes.length > 0 && (
                  <details className={styles.pop} open>
                    <summary className={styles.popTitle}>{S[lang].quotes}</summary>
                    <div className={styles.quotes}>
                      {sidebar.quotes.map((q, i) => (
                        <blockquote key={i} className={styles.quote}>{q}</blockquote>
                      ))}
                    </div>
                  </details>
                )}

                {sidebar.links.length > 0 && (
                  <details className={styles.pop} open>
                    <summary className={styles.popTitle}>{S[lang].links}</summary>
                    <ul className={styles.popList}>
                      {sidebar.links.map((l, i) => (
                        <li key={i}>
                          <a href={l.url} target="_blank" rel="noreferrer noopener" className={styles.popLink}>
                            {l.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {sidebar.raw.length > 0 && (
                  <details className={styles.pop}>
                    <summary className={styles.popTitle}>{S[lang].fields}</summary>
                    <dl className={styles.raw}>
                      {sidebar.raw.map((f, i) => (
                        <div key={i} className={styles.rawRow}>
                          <dt className={styles.rawLabel}>{f.label}</dt>
                          <dd className={styles.rawValue}>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </aside>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// One editor per column type. Commits on blur (or on change for select), so
// there's no separate save step — the field writes itself, like the grid.
function FieldEditor({
  col,
  value,
  onCommit,
}: {
  col: ColumnDef;
  value: string;
  onCommit: (v: string) => void;
}) {
  const { lang } = useLang();
  const [draft, setDraft] = useState(value);
  // keep the field in sync if the record changed under it (e.g. another save)
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setDraft(value); }

  if (col.type === 'long-text') {
    return (
      <textarea
        className={styles.fieldArea}
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        placeholder={S[lang].mdSupported}
      />
    );
  }
  if (col.type === 'select' && col.order && col.order.length) {
    return (
      <select className={styles.fieldInput} value={draft} onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value); }}>
        <option value="">—</option>
        {col.order.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (col.type === 'multiselect') {
    // tags as a comma-separated line; splitTags normalises them on read
    return (
      <input
        className={styles.fieldInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        placeholder={S[lang].tagsPlaceholder}
      />
    );
  }
  const inputType =
    col.type === 'url' ? 'url' : col.type === 'number' || col.type === 'rating' ? 'number' : col.type === 'date' ? 'date' : 'text';
  return (
    <input
      className={styles.fieldInput}
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
    />
  );
}
