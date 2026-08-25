'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson, apiSend } from '@/lib/api';
import { useToast, useConfirm } from '../ui';
import styles from './bin.module.css';

interface Bin { bases: { id: string; name: string }[]; records: { baseId: string; baseName: string; record: { id: string; [k: string]: unknown } }[] }

export default function BinPage() {
  const [bin, setBin] = useState<Bin>({ bases: [], records: [] });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const load = useCallback(() => { apiJson<Bin>('/api/bin').then(setBin).catch(() => {}); }, []);
  useEffect(load, [load]);

  const restoreBase = async (id: string) => {
    try { await apiSend('/api/bases', 'DELETE', { id, restore: true }); load(); toast('Відновлено'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Не вдалося відновити'); }
  };
  const restoreRow = async (base: string, id: string) => {
    try { await apiSend('/api/records', 'DELETE', { base, ids: [id], restore: true }); load(); toast('Відновлено'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Не вдалося відновити'); }
  };

  const empty = async () => {
    let n: { baseCount?: number; records?: number } | undefined;
    try {
      const preview = await apiSend<{ wouldDelete?: { baseCount?: number; records?: number } }>('/api/bin', 'DELETE', {});
      n = preview?.wouldDelete;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося прочитати кошик');
      return;
    }
    const ok = await confirm({
      title: 'Очистити кошик безповоротно?',
      message: `Буде видалено баз: ${n?.baseCount ?? 0}, рядків: ${n?.records ?? 0}. Скасувати не можна.`,
      confirmLabel: 'Очистити',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await apiSend('/api/bin', 'DELETE', { confirm: true }); load(); toast('Кошик очищено'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Не вдалося очистити'); }
    finally { setBusy(false); }
  };

  const empty_ = bin.bases.length === 0 && bin.records.length === 0;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← Бази</Link>
        <h1>Кошик</h1>
        <button className={styles.empty} onClick={empty} disabled={busy || empty_}>Очистити кошик</button>
      </header>

      {empty_ && <p className={styles.none}>Кошик порожній.</p>}

      {bin.bases.length > 0 && (
        <section className={styles.section}><h2>Бази</h2><ul>
          {bin.bases.map((b) => (
            <li key={b.id}><span>{b.name}</span><button onClick={() => restoreBase(b.id)}>Відновити</button></li>
          ))}
        </ul></section>
      )}

      {bin.records.length > 0 && (
        <section className={styles.section}><h2>Рядки</h2><ul>
          {bin.records.map((r) => (
            <li key={r.record.id}><span>{String(r.record.name ?? r.record['название'] ?? r.record.id)} <em>· {r.baseName}</em></span><button onClick={() => restoreRow(r.baseId, r.record.id)}>Відновити</button></li>
          ))}
        </ul></section>
      )}
    </div>
  );
}
