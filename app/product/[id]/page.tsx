import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDataSource } from '@/lib/datasource';
import { CATALOG_COLUMNS } from '@/lib/datasource/columns';
import ThemeToggle from '../../theme-toggle';
import styles from './product.module.css';

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

// Short columns become the fact sheet; long-text columns become sections.
// `name` and `url` are pulled out for the header, so they're skipped below.
const SHORT_COLS = CATALOG_COLUMNS.filter(
  (c) => c.type !== 'long-text' && c.key !== 'name' && c.key !== 'url',
);
const LONG_COLS = CATALOG_COLUMNS.filter((c) => c.type === 'long-text');

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getDataSource().get(id);
  if (!record) notFound();

  const name = String(record.name ?? id);
  const url = hasValue(record.url) ? String(record.url) : null;
  const facts = SHORT_COLS.filter((c) => hasValue(record[c.key]));
  const sections = LONG_COLS.filter((c) => hasValue(record[c.key]));

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          <span aria-hidden="true">←</span> К каталогу
        </Link>
        <div className={styles.headerActions}>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <div className={styles.head}>
          <h1 className={styles.title}>{name}</h1>
          {url && (
            <a className={styles.site} href={url} target="_blank" rel="noreferrer">
              {url.replace(/^https?:\/\//, '')} ↗
            </a>
          )}
        </div>

        <div className={styles.layout}>
          {sections.length > 0 && (
            <div className={styles.sections}>
              {sections.map((c) => (
                <section key={c.key} className={styles.section}>
                  <h2 className={styles.sectionTitle}>{c.label}</h2>
                  <p className={styles.sectionBody}>{String(record[c.key])}</p>
                </section>
              ))}
            </div>
          )}

          {facts.length > 0 && (
            <aside className={styles.facts}>
              <h2 className={styles.factsTitle}>Факты</h2>
              <dl className={styles.factList}>
                {facts.map((c) => (
                  <div key={c.key} className={styles.fact}>
                    <dt className={styles.factLabel}>{c.label}</dt>
                    <dd className={styles.factValue}>{String(record[c.key])}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
