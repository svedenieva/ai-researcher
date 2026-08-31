'use client';

// Trusted-sources registry management. Company-wide: platforms, channels and
// experts the research flow should consult before searching. Edited here
// without touching code — the connector's list_trusted_sources reads the same
// table.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson, apiSend } from '@/lib/api';
import { useToast, useConfirm } from '../ui';
import { useLang } from '../lang-provider';
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

const S = {
  uk: {
    loadError: 'Не вдалося завантажити',
    needName: 'Потрібна назва джерела',
    added: 'Джерело додано',
    addError: 'Не вдалося додати',
    del: 'Видалити',
    removeMessage: 'Джерело зникне з реєстру.',
    removed: 'Видалено',
    removeError: 'Не вдалося видалити',
    back: '← Таблиця',
    title: 'Довірені джерела',
    leadPre: 'Реєстр майданчиків, каналів та експертів, яким компанія довіряє. Дослідження звертається до цього переліку ',
    leadBold: 'перед',
    leadPost: ' пошуком — модель спершу обходить ці джерела за темою.',
    phName: 'Назва (напр. Andrej Karpathy)',
    optPlatform: 'Майданчик',
    optChannel: 'Канал',
    optExpert: 'Експерт',
    phUrl: 'Посилання (https://…)',
    phTopics: 'Теми через кому (ai, agents, ml)',
    phNote: "Нотатка (необов'язково)",
    addBtn: '+ Додати',
    loading: 'Завантаження…',
    empty: 'Реєстр порожній. Додайте перше джерело вище.',
    thName: 'Назва',
    thType: 'Тип',
    thTopics: 'Теми',
    thUrl: 'Посилання',
    thNote: 'Нотатка',
  },
  ru: {
    loadError: 'Не удалось загрузить',
    needName: 'Нужно название источника',
    added: 'Источник добавлен',
    addError: 'Не удалось добавить',
    del: 'Удалить',
    removeMessage: 'Источник исчезнет из реестра.',
    removed: 'Удалено',
    removeError: 'Не удалось удалить',
    back: '← Таблица',
    title: 'Доверенные источники',
    leadPre: 'Реестр площадок, каналов и экспертов, которым доверяет компания. Исследование обращается к этому списку ',
    leadBold: 'перед',
    leadPost: ' поиском — модель сначала обходит эти источники по теме.',
    phName: 'Название (напр. Andrej Karpathy)',
    optPlatform: 'Площадка',
    optChannel: 'Канал',
    optExpert: 'Эксперт',
    phUrl: 'Ссылка (https://…)',
    phTopics: 'Темы через запятую (ai, agents, ml)',
    phNote: 'Заметка (необязательно)',
    addBtn: '+ Добавить',
    loading: 'Загрузка…',
    empty: 'Реестр пуст. Добавьте первый источник выше.',
    thName: 'Название',
    thType: 'Тип',
    thTopics: 'Темы',
    thUrl: 'Ссылка',
    thNote: 'Заметка',
  },
  en: {
    loadError: 'Failed to load',
    needName: 'Source name is required',
    added: 'Source added',
    addError: 'Failed to add',
    del: 'Delete',
    removeMessage: 'The source will disappear from the registry.',
    removed: 'Removed',
    removeError: 'Failed to delete',
    back: '← Table',
    title: 'Trusted sources',
    leadPre: 'A registry of platforms, channels and experts the company trusts. Research consults this list ',
    leadBold: 'before',
    leadPost: ' searching — the model visits these sources by topic first.',
    phName: 'Name (e.g. Andrej Karpathy)',
    optPlatform: 'Platform',
    optChannel: 'Channel',
    optExpert: 'Expert',
    phUrl: 'Link (https://…)',
    phTopics: 'Topics, comma-separated (ai, agents, ml)',
    phNote: 'Note (optional)',
    addBtn: '+ Add',
    loading: 'Loading…',
    empty: 'The registry is empty. Add the first source above.',
    thName: 'Name',
    thType: 'Type',
    thTopics: 'Topics',
    thUrl: 'Link',
    thNote: 'Note',
  },
} as const;

export default function SourcesPage() {
  const { lang } = useLang();
  const t = S[lang];
  const TYPE_LABEL: Record<SourceType, string> = { platform: t.optPlatform, channel: t.optChannel, expert: t.optExpert };
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
      .catch((e) => { toast(e instanceof Error ? e.message : t.loadError); setSources([]); });
  }, [toast, t]);
  useEffect(load, [load]);

  const add = async () => {
    if (!name.trim()) { toast(t.needName); return; }
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
      toast(t.added);
    } catch (e) {
      toast(e instanceof Error ? e.message : t.addError);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: Source) => {
    const ok = await confirm({ title: `${t.del} «${s.name}»?`, message: t.removeMessage, confirmLabel: t.del, danger: true });
    if (!ok) return;
    try {
      await apiSend('/api/sources', 'DELETE', { id: s.id });
      load();
      toast(t.removed);
    } catch (e) {
      toast(e instanceof Error ? e.message : t.removeError);
    }
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>{t.back}</Link>
        <h1>{t.title}</h1>
        <span className={styles.count}>{sources?.length ?? ''}</span>
      </header>

      <p className={styles.lead}>
        {t.leadPre}<b>{t.leadBold}</b>{t.leadPost}
      </p>

      <div className={styles.form}>
        <input className={styles.in} placeholder={t.phName} value={name} onChange={(e) => setName(e.target.value)} />
        <select className={styles.in} value={type} onChange={(e) => setType(e.target.value as SourceType)}>
          <option value="platform">{t.optPlatform}</option>
          <option value="channel">{t.optChannel}</option>
          <option value="expert">{t.optExpert}</option>
        </select>
        <input className={styles.in} placeholder={t.phUrl} value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className={styles.in} placeholder={t.phTopics} value={topics} onChange={(e) => setTopics(e.target.value)} />
        <input className={styles.in} placeholder={t.phNote} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className={styles.add} onClick={add} disabled={busy}>{t.addBtn}</button>
      </div>

      {sources === null && <p className={styles.empty}>{t.loading}</p>}
      {sources?.length === 0 && <p className={styles.empty}>{t.empty}</p>}

      {sources && sources.length > 0 && (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr><th>{t.thName}</th><th>{t.thType}</th><th>{t.thTopics}</th><th>{t.thUrl}</th><th>{t.thNote}</th><th></th></tr>
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
                  <td><button type="button" className={styles.del} onClick={() => remove(s)} title={t.del}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
