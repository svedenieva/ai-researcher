'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson, apiSend } from '@/lib/api';
import { useToast, useConfirm } from '../ui';
import { useLang } from '../lang-provider';
import styles from './bin.module.css';

const S = {
  uk: {
    restored: 'Відновлено',
    restoreFail: 'Не вдалося відновити',
    readBinFail: 'Не вдалося прочитати кошик',
    emptyConfirmTitle: 'Очистити кошик безповоротно?',
    emptyConfirmMsg: (baseCount: number, records: number) => `Буде видалено баз: ${baseCount}, рядків: ${records}. Скасувати не можна.`,
    emptyConfirmLabel: 'Очистити',
    binEmptied: 'Кошик очищено',
    emptyFail: 'Не вдалося очистити',
    backToBases: '← Бази',
    title: 'Кошик',
    emptyBinBtn: 'Очистити кошик',
    binEmpty: 'Кошик порожній.',
    basesHeading: 'Бази',
    rowsHeading: 'Рядки',
    restore: 'Відновити',
  },
  ru: {
    restored: 'Восстановлено',
    restoreFail: 'Не удалось восстановить',
    readBinFail: 'Не удалось прочитать корзину',
    emptyConfirmTitle: 'Очистить корзину безвозвратно?',
    emptyConfirmMsg: (baseCount: number, records: number) => `Будет удалено баз: ${baseCount}, строк: ${records}. Отменить нельзя.`,
    emptyConfirmLabel: 'Очистить',
    binEmptied: 'Корзина очищена',
    emptyFail: 'Не удалось очистить',
    backToBases: '← Базы',
    title: 'Корзина',
    emptyBinBtn: 'Очистить корзину',
    binEmpty: 'Корзина пуста.',
    basesHeading: 'Базы',
    rowsHeading: 'Строки',
    restore: 'Восстановить',
  },
  en: {
    restored: 'Restored',
    restoreFail: 'Could not restore',
    readBinFail: 'Could not read the bin',
    emptyConfirmTitle: 'Empty the bin permanently?',
    emptyConfirmMsg: (baseCount: number, records: number) => `${baseCount} base(s) and ${records} row(s) will be deleted. This cannot be undone.`,
    emptyConfirmLabel: 'Empty',
    binEmptied: 'Bin emptied',
    emptyFail: 'Could not empty',
    backToBases: '← Bases',
    title: 'Bin',
    emptyBinBtn: 'Empty bin',
    binEmpty: 'The bin is empty.',
    basesHeading: 'Bases',
    rowsHeading: 'Rows',
    restore: 'Restore',
  },
} as const;

interface Bin { bases: { id: string; name: string }[]; records: { baseId: string; baseName: string; record: { id: string; [k: string]: unknown } }[] }

export default function BinPage() {
  const { lang } = useLang();
  const t = S[lang];
  const [bin, setBin] = useState<Bin>({ bases: [], records: [] });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const load = useCallback(() => { apiJson<Bin>('/api/bin').then(setBin).catch(() => {}); }, []);
  useEffect(load, [load]);

  const restoreBase = async (id: string) => {
    try { await apiSend('/api/bases', 'DELETE', { id, restore: true }); load(); toast(t.restored); }
    catch (e) { toast(e instanceof Error ? e.message : t.restoreFail); }
  };
  const restoreRow = async (base: string, id: string) => {
    try { await apiSend('/api/records', 'DELETE', { base, ids: [id], restore: true }); load(); toast(t.restored); }
    catch (e) { toast(e instanceof Error ? e.message : t.restoreFail); }
  };

  const empty = async () => {
    let n: { baseCount?: number; records?: number } | undefined;
    try {
      const preview = await apiSend<{ wouldDelete?: { baseCount?: number; records?: number } }>('/api/bin', 'DELETE', {});
      n = preview?.wouldDelete;
    } catch (e) {
      toast(e instanceof Error ? e.message : t.readBinFail);
      return;
    }
    const ok = await confirm({
      title: t.emptyConfirmTitle,
      message: t.emptyConfirmMsg(n?.baseCount ?? 0, n?.records ?? 0),
      confirmLabel: t.emptyConfirmLabel,
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await apiSend('/api/bin', 'DELETE', { confirm: true }); load(); toast(t.binEmptied); }
    catch (e) { toast(e instanceof Error ? e.message : t.emptyFail); }
    finally { setBusy(false); }
  };

  const empty_ = bin.bases.length === 0 && bin.records.length === 0;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>{t.backToBases}</Link>
        <h1>{t.title}</h1>
        <button className={styles.empty} onClick={empty} disabled={busy || empty_}>{t.emptyBinBtn}</button>
      </header>

      {empty_ && <p className={styles.none}>{t.binEmpty}</p>}

      {bin.bases.length > 0 && (
        <section className={styles.section}><h2>{t.basesHeading}</h2><ul>
          {bin.bases.map((b) => (
            <li key={b.id}><span>{b.name}</span><button onClick={() => restoreBase(b.id)}>{t.restore}</button></li>
          ))}
        </ul></section>
      )}

      {bin.records.length > 0 && (
        <section className={styles.section}><h2>{t.rowsHeading}</h2><ul>
          {bin.records.map((r) => (
            <li key={r.record.id}><span>{String(r.record.name ?? r.record['название'] ?? r.record.id)} <em>· {r.baseName}</em></span><button onClick={() => restoreRow(r.baseId, r.record.id)}>{t.restore}</button></li>
          ))}
        </ul></section>
      )}
    </div>
  );
}
