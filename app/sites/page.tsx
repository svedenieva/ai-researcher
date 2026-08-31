'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';
import { formatBytes, isJunk, validateUpload, type SiteMeta } from '@/lib/sites/site';
import { unzipEntries } from '@/lib/sites/zip';
import { apiJson, apiSend } from '@/lib/api';
import { useToast } from '../ui';
import { useLang } from '../lang-provider';
import styles from './sites.module.css';

// co-located UI dictionary: uk is the source wording, ru/en translated
const S = {
  uk: {
    errGeneric: 'Помилка',
    defaultSiteName: 'Сайт',
    errUnzip: 'Не вдалося розпакувати архів — він пошкоджений або це не zip',
    errUpload: 'Помилка завантаження',
    confirmDelete: (name: string) => `Видалити «${name}» разом з усіма файлами? Відновити не буде звідки.`,
    errDelete: 'Помилка видалення',
    backToCatalog: 'До каталогу',
    title: 'Сайти',
    leadA: 'Готові статичні сторінки: залити папкою або архівом, відкрити наживо, завантажити назад. Усередині сайту шляхи мають бути відносними — ',
    leadB: ', а не ',
    leadC: '.',
    pickFolder: 'Обрати папку',
    pickZip: 'Обрати .zip',
    files: (n: number) => `${n} файл(ів)`,
    startLabel: 'старт:',
    labelName: 'Назва *',
    labelClient: 'Клієнт',
    labelTags: 'Теги через кому',
    labelNote: 'Нотатка',
    uploading: (done: number, total: number) => `Завантажую ${done} з ${total}…`,
    uploadSite: 'Завантажити сайт',
    cancel: 'Скасувати',
    searchPlaceholder: 'Пошук за назвою, клієнтом, нотаткою…',
    ariaTag: 'Тег',
    allTags: 'Усі теги',
    ariaSort: 'Сортування',
    sortNewest: 'Спочатку нові',
    sortName: 'За назвою',
    sitesCount: (n: number) => `${n} сайтів`,
    shownOf: (shown: number, total: number) => `показано ${shown} з ${total}`,
    loadingText: 'Завантажую…',
    nothingFound: 'Нічого не знайдено',
    noSites: 'Поки що жодного сайту',
    thName: 'Назва',
    thClient: 'Клієнт',
    thTags: 'Теги',
    thUploaded: 'Завантажено',
    thSize: 'Розмір',
    thOwner: 'Залив',
    filesShort: (n: number) => `${n} ф.`,
    openSite: 'Відкрити',
    downloadSite: 'Завантажити',
    deleteSite: 'Видалити',
  },
  ru: {
    errGeneric: 'Ошибка',
    defaultSiteName: 'Сайт',
    errUnzip: 'Не удалось распаковать архив — он повреждён или это не zip',
    errUpload: 'Ошибка загрузки',
    confirmDelete: (name: string) => `Удалить «${name}» вместе со всеми файлами? Восстановить будет неоткуда.`,
    errDelete: 'Ошибка удаления',
    backToCatalog: 'В каталог',
    title: 'Сайты',
    leadA: 'Готовые статические страницы: залить папкой или архивом, открыть вживую, скачать обратно. Внутри сайта пути должны быть относительными — ',
    leadB: ', а не ',
    leadC: '.',
    pickFolder: 'Выбрать папку',
    pickZip: 'Выбрать .zip',
    files: (n: number) => `${n} файл(ов)`,
    startLabel: 'старт:',
    labelName: 'Название *',
    labelClient: 'Клиент',
    labelTags: 'Теги через запятую',
    labelNote: 'Заметка',
    uploading: (done: number, total: number) => `Загружаю ${done} из ${total}…`,
    uploadSite: 'Загрузить сайт',
    cancel: 'Отменить',
    searchPlaceholder: 'Поиск по названию, клиенту, заметке…',
    ariaTag: 'Тег',
    allTags: 'Все теги',
    ariaSort: 'Сортировка',
    sortNewest: 'Сначала новые',
    sortName: 'По названию',
    sitesCount: (n: number) => `${n} сайтов`,
    shownOf: (shown: number, total: number) => `показано ${shown} из ${total}`,
    loadingText: 'Загружаю…',
    nothingFound: 'Ничего не найдено',
    noSites: 'Пока ни одного сайта',
    thName: 'Название',
    thClient: 'Клиент',
    thTags: 'Теги',
    thUploaded: 'Загружено',
    thSize: 'Размер',
    thOwner: 'Залил',
    filesShort: (n: number) => `${n} ф.`,
    openSite: 'Открыть',
    downloadSite: 'Скачать',
    deleteSite: 'Удалить',
  },
  en: {
    errGeneric: 'Error',
    defaultSiteName: 'Site',
    errUnzip: 'Could not unzip the archive — it is corrupted or not a zip',
    errUpload: 'Upload error',
    confirmDelete: (name: string) => `Delete "${name}" along with all its files? There will be no way to restore it.`,
    errDelete: 'Delete error',
    backToCatalog: 'To catalog',
    title: 'Sites',
    leadA: 'Ready static pages: upload as a folder or archive, open live, download back. Inside the site, paths must be relative — ',
    leadB: ', not ',
    leadC: '.',
    pickFolder: 'Choose folder',
    pickZip: 'Choose .zip',
    files: (n: number) => `${n} file(s)`,
    startLabel: 'start:',
    labelName: 'Name *',
    labelClient: 'Client',
    labelTags: 'Tags, comma-separated',
    labelNote: 'Note',
    uploading: (done: number, total: number) => `Uploading ${done} of ${total}…`,
    uploadSite: 'Upload site',
    cancel: 'Cancel',
    searchPlaceholder: 'Search by name, client, note…',
    ariaTag: 'Tag',
    allTags: 'All tags',
    ariaSort: 'Sorting',
    sortNewest: 'Newest first',
    sortName: 'By name',
    sitesCount: (n: number) => `${n} sites`,
    shownOf: (shown: number, total: number) => `showing ${shown} of ${total}`,
    loadingText: 'Loading…',
    nothingFound: 'Nothing found',
    noSites: 'No sites yet',
    thName: 'Name',
    thClient: 'Client',
    thTags: 'Tags',
    thUploaded: 'Uploaded',
    thSize: 'Size',
    thOwner: 'Uploaded by',
    filesShort: (n: number) => `${n} files`,
    openSite: 'Open',
    downloadSite: 'Download',
    deleteSite: 'Delete',
  },
} as const;

// a file ready to be sent: path within the site + the content itself
interface Picked {
  path: string;
  blob: Blob;
}

type SortKey = 'date' | 'name';

export default function Sites() {
  const toast = useToast();
  const { lang } = useLang();
  const [sites, setSites] = useState<SiteMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // search and parsing
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');

  // upload form
  const [picked, setPicked] = useState<Picked[] | null>(null);
  const [entry, setEntry] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await apiJson<{ sites?: SiteMeta[] }>('/api/sites');
      setSites(body.sites ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : S[lang].errGeneric);
    } finally {
      setLoading(false);
    }
  }, [toast, lang]);

  useEffect(() => {
    load();
  }, [load]);

  // shared parsing for a folder and an archive: validate and remember what we'll send
  const accept = useCallback((raw: Picked[], fallbackName: string) => {
    const kept = raw.filter((r) => !isJunk(r.path));
    const check = validateUpload(kept.map((r) => ({ path: r.path, size: r.blob.size })));
    if (!check.ok) {
      setPicked(null);
      setPickError(check.error);
      return;
    }
    // validateUpload preserves order, so each new path lands on its own file
    setPicked(check.value.files.map((f, i) => ({ path: f.path, blob: kept[i].blob })));
    setEntry(check.value.entry);
    setPickError(null);
    if (!name.trim()) setName(fallbackName);
  }, [name]);

  const onFolder = (list: FileList | null) => {
    if (!list?.length) return;
    const raw: Picked[] = Array.from(list).map((f) => ({
      // webkitRelativePath stores the path together with the selected folder
      path: f.webkitRelativePath || f.name,
      blob: f,
    }));
    const root = raw[0]?.path.split('/')[0] ?? S[lang].defaultSiteName;
    accept(raw, root);
  };

  const onZip = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const raw: Picked[] = unzipEntries(bytes).map((e) => ({
        path: e.path,
        blob: new Blob([e.bytes as unknown as BlobPart]),
      }));
      accept(raw, file.name.replace(/\.zip$/i, ''));
    } catch {
      setPicked(null);
      setPickError(S[lang].errUnzip);
    }
  };

  const reset = () => {
    setPicked(null);
    setEntry('');
    setName('');
    setClient('');
    setTags('');
    setNote('');
    setPickError(null);
    setProgress(null);
    if (folderInput.current) folderInput.current.value = '';
    if (zipInput.current) zipInput.current.value = '';
  };

  const upload = async () => {
    if (!picked || !name.trim()) return;
    setPickError(null);
    setProgress({ done: 0, total: picked.length });
    try {
      const body = await apiSend<{ site: { id: string } }>('/api/sites', 'POST', {
        name: name.trim(),
        client: client.trim(),
        note: note.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        files: picked.map((p) => ({ path: p.path, size: p.blob.size })),
      });
      const id = body.site.id;

      // one request per file: the serverless request body is limited to ~4.5 MB
      for (let i = 0; i < picked.length; i++) {
        const form = new FormData();
        form.append('path', picked[i].path);
        form.append('file', picked[i].blob, picked[i].path.split('/').pop() ?? 'file');
        // FormData body — no Content-Type header, the browser sets the multipart boundary
        await apiJson(`/api/sites/${encodeURIComponent(id)}/files`, { method: 'POST', body: form });
        setProgress({ done: i + 1, total: picked.length });
      }
      reset();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : S[lang].errUpload);
      setProgress(null);
    }
  };

  const remove = async (site: SiteMeta) => {
    if (!confirm(S[lang].confirmDelete(site.name))) return;
    try {
      await apiJson(`/api/sites/${encodeURIComponent(site.id)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : S[lang].errDelete);
    }
  };

  const allTags = useMemo(
    () => [...new Set(sites.flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b, 'uk')),
    [sites],
  );

  // client-side filtering: dozens of rows, no need to push them through the server
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sites.filter((s) => {
      if (tag && !s.tags.includes(tag)) return false;
      if (!q) return true;
      return [s.name, s.client ?? '', s.note ?? ''].some((v) => v.toLowerCase().includes(q));
    });
    return [...list].sort((a, b) =>
      sortKey === 'name'
        ? a.name.localeCompare(b.name, 'uk')
        : b.createdAt.localeCompare(a.createdAt),
    );
  }, [sites, query, tag, sortKey]);

  const busy = progress !== null;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          <span aria-hidden="true">←</span> {S[lang].backToCatalog}
        </Link>
        <div className={styles.headerActions}>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.body}>
        <h1 className={styles.title}>{S[lang].title}</h1>
        <p className={styles.lead}>
          {S[lang].leadA}<code>style.css</code>{S[lang].leadB}<code>/style.css</code>{S[lang].leadC}
        </p>

        <section className={styles.uploader}>
          <div className={styles.pickRow}>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => folderInput.current?.click()}
              disabled={busy}
            >
              {S[lang].pickFolder}
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => zipInput.current?.click()}
              disabled={busy}
            >
              {S[lang].pickZip}
            </button>
            {picked && (
              <span className={styles.pickInfo}>
                {S[lang].files(picked.length)} · {formatBytes(picked.reduce((s, p) => s + p.blob.size, 0))} · {S[lang].startLabel}{' '}
                <code>{entry}</code>
              </span>
            )}
            {pickError && <span className={styles.error}>{pickError}</span>}
          </div>

          {/* webkitdirectory isn't in React's types — pass the attributes as-is */}
          <input
            ref={folderInput}
            type="file"
            hidden
            multiple
            {...{ webkitdirectory: '', directory: '' }}
            onChange={(e) => onFolder(e.target.files)}
          />
          <input ref={zipInput} type="file" hidden accept=".zip,application/zip" onChange={(e) => onZip(e.target.files)} />

          {picked && (
            <>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{S[lang].labelName}</span>
                  <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{S[lang].labelClient}</span>
                  <input className={styles.input} value={client} onChange={(e) => setClient(e.target.value)} disabled={busy} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{S[lang].labelTags}</span>
                  <input className={styles.input} value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{S[lang].labelNote}</span>
                  <input className={styles.input} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
                </label>
              </div>

              <div className={styles.uploadActions}>
                <button type="button" className={styles.primary} onClick={upload} disabled={busy || !name.trim()}>
                  {busy ? S[lang].uploading(progress!.done, progress!.total) : S[lang].uploadSite}
                </button>
                <button type="button" className={styles.ghost} onClick={reset} disabled={busy}>
                  {S[lang].cancel}
                </button>
                {busy && (
                  <span className={styles.bar}>
                    <span className={styles.barFill} style={{ width: `${(progress!.done / progress!.total) * 100}%` }} />
                  </span>
                )}
              </div>
            </>
          )}
        </section>

        <div className={styles.tools}>
          <input
            type="search"
            className={styles.search}
            placeholder={S[lang].searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className={styles.select} value={tag} onChange={(e) => setTag(e.target.value)} aria-label={S[lang].ariaTag}>
            <option value="">{S[lang].allTags}</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className={styles.select}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label={S[lang].ariaSort}
          >
            <option value="date">{S[lang].sortNewest}</option>
            <option value="name">{S[lang].sortName}</option>
          </select>
          <span className={styles.count}>
            {shown.length === sites.length ? S[lang].sitesCount(sites.length) : S[lang].shownOf(shown.length, sites.length)}
          </span>
        </div>

        {loading ? (
          <p className={styles.empty}>{S[lang].loadingText}</p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>{sites.length ? S[lang].nothingFound : S[lang].noSites}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{S[lang].thName}</th>
                  <th>{S[lang].thClient}</th>
                  <th>{S[lang].thTags}</th>
                  <th>{S[lang].thUploaded}</th>
                  <th>{S[lang].thSize}</th>
                  <th>{S[lang].thOwner}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <a className={styles.siteLink} href={`/s/${encodeURIComponent(s.id)}`} target="_blank" rel="noreferrer">
                        {s.name}
                      </a>
                      {s.note && <div className={styles.note}>{s.note}</div>}
                    </td>
                    <td>{s.client || <span className={styles.dim}>—</span>}</td>
                    <td>
                      {s.tags.length ? (
                        <span className={styles.tags}>
                          {s.tags.map((t) => (
                            <button key={t} type="button" className={styles.tagChip} onClick={() => setTag(t)}>
                              {t}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <span className={styles.dim}>—</span>
                      )}
                    </td>
                    <td className={styles.mono}>{s.createdAt ? s.createdAt.slice(0, 10) : '—'}</td>
                    <td className={styles.mono}>
                      {formatBytes(s.sizeBytes)}
                      <span className={styles.dim}> · {S[lang].filesShort(s.fileCount)}</span>
                    </td>
                    <td className={styles.dim}>{s.owner ?? '—'}</td>
                    <td className={styles.rowActions}>
                      <a className={styles.action} href={`/s/${encodeURIComponent(s.id)}`} target="_blank" rel="noreferrer">
                        {S[lang].openSite}
                      </a>
                      <a className={styles.action} href={`/api/sites/${encodeURIComponent(s.id)}/download`}>
                        {S[lang].downloadSite}
                      </a>
                      <button type="button" className={styles.danger} onClick={() => remove(s)}>
                        {S[lang].deleteSite}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
