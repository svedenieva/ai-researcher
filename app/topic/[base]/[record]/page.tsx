import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { withTagsColumn } from '@/lib/tags';
import ThemeToggle from '../../../theme-toggle';
import ArticleClient from './ArticleClient';
import styles from './article.module.css';

// §5.5 reading view. A single base record ("тема") shown as a calm, structured
// article — the §4.5 triad first (описание · инструкции · чек-листы), extra
// material (sources, verbatim quotes, related links, raw fields) tucked into a
// side rail that pops open on demand, so the article body never shifts. The body
// (ArticleClient) can also be edited in place — every field, by its type, saved
// through the same PATCH the grid uses. Access is base-level (canAccessBase).

// This page depends on the signed-in user (base access) — it must never be
// cached and served to another visitor, and must always run per request.
export const dynamic = 'force-dynamic';

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ base: string; record: string }>;
}) {
  const { base: rawBase, record: rawRecord } = await params;
  // Next hands path params still percent-encoded. Base ids can be Cyrillic
  // («ауц», «исследования»…), so without decoding, getBase() looks up the
  // literal "%D0%B0…" and always 404s. Decode defensively — a malformed value
  // just falls back to the raw string and 404s cleanly rather than throwing.
  const baseId = safeDecode(rawBase);
  const recordId = safeDecode(rawRecord);

  const store = getCustomStore();
  const me = await currentEmail();
  const custom = await store.getBase(baseId);
  if (!custom || !canAccessBase(custom, me)) notFound();

  const record = (await store.listRecords(baseId)).find((r) => String(r.id) === recordId);

  // The base is accessible but this row is gone — most often it was deleted
  // (soft-deleted rows are excluded from listRecords, so its old link now points
  // at nothing). Show a calm "not found" with a way back to the base instead of
  // the bare framework 404, which reads like the whole app broke.
  if (!record) {
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
          <div className={styles.missing}>
            <h1 className={styles.missingTitle}>Тему не знайдено</h1>
            <p className={styles.missingText}>
              Схоже, цей запис видалено. Якщо це сталося помилково, його можна повернути з кошика.
            </p>
            <Link href={`/?base=${encodeURIComponent(baseId)}`} className={styles.missingBack}>
              ← Повернутися до бази «{custom.name}»
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const columns = withTagsColumn(custom.columns);
  // The reading view (and its in-place editing) is a client component; the
  // server's job is the access check and handing over the record + columns.
  return <ArticleClient columns={columns} record={record} baseId={baseId} baseName={custom.name} />;
}
