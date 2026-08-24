'use client';

// Trusted-sources registry management. Company-wide: platforms, channels and
// experts the research flow should consult before searching. Edited here
// without touching code — the connector's list_trusted_sources reads the same
// table.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson, apiSend } from '@/lib/api';
import { useToast, useConfirm } from '../ui';
import styles from './sources.module.css';

type SourceType = 'platform' | 'channel' | 'expert';
interface Source {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  topics: string[];
  note?: string | null;
}

const TYPE_LABEL: Record<SourceType, string> = { platform: 'Площадка', channel: 'Канал', expert: 'Експерт' };

export default function SourcesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<SourceType>('expert');
  const [url, setUrl] = useState('');
  const [topics, setTopics] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiJson<{ sources?: Source[] }>('/api/sources')
      .then((b) => setSources(b.sources ?? []))
      .catch((e) => { toast(e instanceof Error ? e.message : 'Не вдалося завантажити'); setSources([]); });
  }, [toast]);
  useEffect(load, [load]);

  const add = async () => {
    if (!name.trim()) { toast('Потрібна назва джерела'); return; }
    setBusy(true);
    try {
      await apiSend('/api/sources', 'POST', {
        name: name.trim(),
        type,
        url: url.trim(),
        topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
        note: note.trim() || null,
      });
      setName(''); setUrl(''); setTopics(''); setNote(''); setType('expert');
      load();
      toast('Джерело додано');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося додати');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: Source) => {
    const ok = await confirm({ title: `Видалити «${s.name}»?`, message: 'Джерело зникне з реєстру.', confirmLabel: 'Видалити', danger: true });
    if (!ok) return;
    try {
      await apiSend('/api/sources', 'DELETE', { id: s.id });
      load();
      toast('Видалено');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося видалити');
    }
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← Таблиця</Link>
        <h1>Довірені джерела</h1>
        <span className={styles.count}>{sources?.length ?? ''}</span>
      </header>

      <p className={styles.lead}>
        Реєстр майданчиків, каналів та експертів, яким компанія довіряє. Дослідження звертається
        до цього переліку <b>перед</b> пошуком — модель спершу обходить ці джерела за темою.
      </p>

      <div className={styles.form}>
        <input className={styles.in} placeholder="Назва (напр. Andrej Karpathy)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={styles.in} value={type} onChange={(e) => setType(e.target.value as SourceType)}>
          <option value="platform">Площадка</option>
          <option value="channel">Канал</option>
          <option value="expert">Експерт</option>
        </select>
        <input className={styles.in} placeholder="Посилання (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className={styles.in} placeholder="Теми через кому (ai, agents, ml)" value={topics} onChange={(e) => setTopics(e.target.value)} />
        <input className={styles.in} placeholder="Заметка (необов'язково)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className={styles.add} onClick={add} disabled={busy}>+ Додати</button>
      </div>

      {sources === null && <p className={styles.empty}>Завантаження…</p>}
      {sources?.length === 0 && <p className={styles.empty}>Реєстр порожній. Додайте перше джерело вище.</p>}

      {sources && sources.length > 0 && (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr><th>Назва</th><th>Тип</th><th>Теми</th><th>Посилання</th><th>Заметка</th><th></th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className={styles.nm}>{s.name}</td>
                  <td><span className={styles.pill}>{TYPE_LABEL[s.type]}</span></td>
                  <td>
                    <span className={styles.tags}>
                      {s.topics.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                    </span>
                  </td>
                  <td>{s.url ? <a className={styles.lnk} href={s.url} target="_blank" rel="noreferrer">{s.url.replace(/^https?:\/\//, '')}</a> : <span className={styles.dash}>—</span>}</td>
                  <td className={styles.note}>{s.note || <span className={styles.dash}>—</span>}</td>
                  <td><button type="button" className={styles.del} onClick={() => remove(s)} title="Видалити">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
