import { notFound } from 'next/navigation';
import { getCustomStore } from '@/lib/datasource/customStore';
import { sharingEnabled, verifyShareToken } from '@/lib/research/share';
import styles from './public.module.css';

export const dynamic = 'force-dynamic';

// Public, read-only view of one base, reached by an unguessable HMAC link (see
// lib/research/share.ts). No login, no editing, no other base. Renders the base
// directly from the store; an invalid or disabled token is a plain 404, so a
// guessed id never confirms a base exists.
export default async function PublicBase({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t = '' } = await searchParams;
  if (!sharingEnabled() || !verifyShareToken(id, t)) notFound();

  const store = getCustomStore();
  const base = await store.getBase(id).catch(() => null);
  if (!base) notFound();

  const columns = base.columns.filter((c) => !c.key.startsWith('__'));
  const records = await store.listRecords(id);

  return (
    <div className={styles.shell}>
      <header className={styles.head}>
        <h1 className={styles.title}>{base.name}</h1>
        <span className={styles.badge}>тільки для перегляду · {records.length}</span>
      </header>

      {records.length === 0 ? (
        <p className={styles.empty}>Поки що порожньо.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>{renderCell(r[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className={styles.foot}>AI-Researcher · спільний доступ лише для читання</footer>
    </div>
  );
}

const URL_RE = /^https?:\/\/\S+$/i;
function renderCell(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value);
  if (URL_RE.test(s.trim())) {
    return <a href={s.trim()} target="_blank" rel="noreferrer noopener">{s.trim()}</a>;
  }
  return s;
}
