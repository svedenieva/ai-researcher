import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { withTagsColumn } from '@/lib/tags';
import { buildArticle } from '@/lib/article';
import { renderMarkdown } from '@/lib/markdown';
import { MODE_REFERENCE } from '@/lib/mode';
import ThemeToggle from '../../../theme-toggle';
import styles from './article.module.css';

// §5.5 reading view. A single base record ("тема") shown as a calm, structured
// article — the §4.5 triad first (описание · инструкции · чек-листы), extra
// material (sources, verbatim quotes, related links, raw fields) tucked into a
// side rail that pops open on demand, so the article body never shifts. Read-only
// by design: editing stays in the grid. Access is base-level (canAccessBase).

export default async function TopicPage({
  params,
}: {
  params: Promise<{ base: string; record: string }>;
}) {
  const { base: baseId, record: recordId } = await params;

  const store = getCustomStore();
  const me = await currentEmail();
  const custom = await store.getBase(baseId);
  if (!custom || !canAccessBase(custom, me)) notFound();

  const record = (await store.listRecords(baseId)).find((r) => String(r.id) === recordId);
  if (!record) notFound();

  const columns = withTagsColumn(custom.columns);
  const article = buildArticle(columns, record);
  const { sidebar } = article;
  const hasSidebar =
    sidebar.sources.length > 0 ||
    sidebar.quotes.length > 0 ||
    sidebar.links.length > 0 ||
    sidebar.raw.length > 0;
  const isReference = article.mode === 'reference';

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href={`/?base=${baseId}`} className={styles.back}>
          <span aria-hidden="true">←</span> {custom.name}
        </Link>
        <div className={styles.headerActions}>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <div className={styles.head}>
          <div className={styles.badgeRow}>
            <span className={isReference ? styles.modeReference : styles.modeDraft}>
              {isReference ? MODE_REFERENCE : 'Черновик'}
            </span>
            {article.badges.map((b, i) => (
              <Link
                key={`${b.column}-${i}`}
                href={`/?base=${encodeURIComponent(baseId)}&${encodeURIComponent(b.column)}=${encodeURIComponent(b.value)}`}
                className={styles.tag}
                title={`${b.label}: ${b.value} — показать в базе`}
              >
                {b.value}
              </Link>
            ))}
          </div>
          <h1 className={styles.title}>{article.title || 'Без названия'}</h1>
        </div>

        <div className={hasSidebar ? styles.layout : styles.layoutWide}>
          <article className={styles.sections}>
            {article.sections.length === 0 && (
              <p className={styles.empty}>У этой темы пока нет текстового наполнения.</p>
            )}
            {article.sections.map((s) =>
              s.kind === 'checklist' ? (
                <section key={s.key} className={styles.section}>
                  <h2 className={styles.sectionTitle}>{s.heading}</h2>
                  <ul className={styles.checklist}>
                    {(s.items ?? []).map((item, i) => (
                      <li key={i} className={styles.checkItem}>
                        <span aria-hidden="true" className={styles.checkBox}>☐</span>
                        <span>{item}</span>
                      </li>
                    ))}
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
                  <summary className={styles.popTitle}>Источники</summary>
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
                  <summary className={styles.popTitle}>Цитаты</summary>
                  <div className={styles.quotes}>
                    {sidebar.quotes.map((q, i) => (
                      <blockquote key={i} className={styles.quote}>{q}</blockquote>
                    ))}
                  </div>
                </details>
              )}

              {sidebar.links.length > 0 && (
                <details className={styles.pop} open>
                  <summary className={styles.popTitle}>Ссылки</summary>
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
                  <summary className={styles.popTitle}>Поля</summary>
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
      </main>
    </div>
  );
}
