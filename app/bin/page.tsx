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
    try { await apiSend('/api/bases', 'DELETE', { id, restore: true }); load(); toast('Восстановлено'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Не удалось восстановить'); }
  };
  const restoreRow = async (base: string, id: string) => {
    try { await apiSend('/api/records', 'DELETE', { base, ids: [id], restore: true }); load(); toast('Восстановлено'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Не удалось восстановить'); }
  };

  const empty = async () => {
    let n: { baseCount?: number; records?: number } | undefined;
    try {
      const preview = await apiSend<{ wouldDelete?: { baseCount?: number; records?: number } }>('/api/bin', 'DELETE', {});
      n = preview?.wouldDelete;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось прочитать корзину');
      return;
    }
    const ok = await confirm({
      title: 'Очистить корзину безвозвратно?',
      message: `Будет удалено баз: ${n?.baseCount ?? 0}, строк: ${n?.records ?? 0}. Отменить нельзя.`,
      confirmLabel: 'Очистить',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await apiSend('/api/bin', 'DELETE', { confirm: true }); load(); toast('Корзина очищена'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Не удалось очистить'); }
    finally { setBusy(false); }
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
        <section className={styles.section}><h2>Базы</h2><ul>
          {bin.bases.map((b) => (
            <li key={b.id}><span>{b.name}</span><button onClick={() => restoreBase(b.id)}>Восстановить</button></li>
          ))}
        </ul></section>
      )}

      {bin.records.length > 0 && (
        <section className={styles.section}><h2>Строки</h2><ul>
          {bin.records.map((r) => (
            <li key={r.record.id}><span>{String(r.record.name ?? r.record['название'] ?? r.record.id)} <em>· {r.baseName}</em></span><button onClick={() => restoreRow(r.baseId, r.record.id)}>Восстановить</button></li>
          ))}
        </ul></section>
      )}
    </div>
  );
}
