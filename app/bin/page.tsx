'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './bin.module.css';

interface Bin { bases: { id: string; name: string }[]; records: { baseId: string; baseName: string; record: { id: string; [k: string]: unknown } }[] }

export default function BinPage() {
  const [bin, setBin] = useState<Bin>({ bases: [], records: [] });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { fetch('/api/bin').then((r) => r.json()).then(setBin).catch(() => {}); }, []);
  useEffect(load, [load]);

  const restoreBase = async (id: string) => { await fetch('/api/bases', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, restore: true }) }); load(); };
  const restoreRow = async (base: string, id: string) => { await fetch('/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base, ids: [id], restore: true }) }); load(); };

  const empty = async () => {
    const preview = await (await fetch('/api/bin', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })).json();
    const n = preview?.wouldDelete;
    if (!window.confirm(`Очистить корзину безвозвратно? Будет удалено баз: ${n?.baseCount ?? 0}, строк: ${n?.records ?? 0}. Отменить нельзя.`)) return;
    setBusy(true);
    try { await fetch('/api/bin', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) }); load(); } finally { setBusy(false); }
  };

  const empty_ = bin.bases.length === 0 && bin.records.length === 0;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← Базы</Link>
        <h1>Корзина</h1>
        <button className={styles.empty} onClick={empty} disabled={busy || empty_}>Очистить корзину</button>
      </header>

      {empty_ && <p className={styles.none}>Корзина пуста.</p>}

      {bin.bases.length > 0 && (
        <section><h2>Базы</h2><ul>
          {bin.bases.map((b) => (
            <li key={b.id}><span>{b.name}</span><button onClick={() => restoreBase(b.id)}>Восстановить</button></li>
          ))}
        </ul></section>
      )}

      {bin.records.length > 0 && (
        <section><h2>Строки</h2><ul>
          {bin.records.map((r) => (
            <li key={r.record.id}><span>{String(r.record.name ?? r.record['название'] ?? r.record.id)} <em>· {r.baseName}</em></span><button onClick={() => restoreRow(r.baseId, r.record.id)}>Восстановить</button></li>
          ))}
        </ul></section>
      )}
    </div>
  );
}
