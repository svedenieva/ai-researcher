'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';
import { formatBytes, isJunk, validateUpload, type SiteMeta } from '@/lib/sites/site';
import { unzipEntries } from '@/lib/sites/zip';
import styles from './sites.module.css';

// файл, готовый к отправке: путь внутри сайта + само содержимое
interface Picked {
  path: string;
  blob: Blob;
}

type SortKey = 'date' | 'name';

export default function Sites() {
  const [sites, setSites] = useState<SiteMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // поиск и разбор
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');

  // форма загрузки
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
      const res = await fetch('/api/sites');
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Не удалось загрузить список');
      setSites(body.sites ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // общий разбор для папки и архива: проверяем и запоминаем, что отправим
  const accept = useCallback((raw: Picked[], fallbackName: string) => {
    const kept = raw.filter((r) => !isJunk(r.path));
    const check = validateUpload(kept.map((r) => ({ path: r.path, size: r.blob.size })));
    if (!check.ok) {
      setPicked(null);
      setPickError(check.error);
      return;
    }
    // validateUpload сохраняет порядок, поэтому новый путь ложится на свой файл
    setPicked(check.value.files.map((f, i) => ({ path: f.path, blob: kept[i].blob })));
    setEntry(check.value.entry);
    setPickError(null);
    if (!name.trim()) setName(fallbackName);
  }, [name]);

  const onFolder = (list: FileList | null) => {
    if (!list?.length) return;
    const raw: Picked[] = Array.from(list).map((f) => ({
      // webkitRelativePath хранит путь вместе с выбранной папкой
      path: f.webkitRelativePath || f.name,
      blob: f,
    }));
    const root = raw[0]?.path.split('/')[0] ?? 'Сайт';
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
      setPickError('Не удалось распаковать архив — он повреждён или это не zip');
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
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          client: client.trim(),
          note: note.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          files: picked.map((p) => ({ path: p.path, size: p.blob.size })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Не удалось создать сайт');
      const id: string = body.site.id;

      // по одному запросу на файл: тело serverless-запроса ограничено ~4,5 МБ
      for (let i = 0; i < picked.length; i++) {
        const form = new FormData();
        form.append('path', picked[i].path);
        form.append('file', picked[i].blob, picked[i].path.split('/').pop() ?? 'file');
        const up = await fetch(`/api/sites/${encodeURIComponent(id)}/files`, { method: 'POST', body: form });
        if (!up.ok) {
          const err = await up.json().catch(() => ({}));
          throw new Error(err?.error ?? `Не удалось записать «${picked[i].path}»`);
        }
        setProgress({ done: i + 1, total: picked.length });
      }
      reset();
      await load();
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setProgress(null);
    }
  };

  const remove = async (site: SiteMeta) => {
    if (!confirm(`Удалить «${site.name}» вместе со всеми файлами? Восстановить будет неоткуда.`)) return;
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(site.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Не удалось удалить');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  const allTags = useMemo(
    () => [...new Set(sites.flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b, 'ru')),
    [sites],
  );

  // фильтрация на клиенте: десятки строк, гонять их через сервер незачем
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sites.filter((s) => {
      if (tag && !s.tags.includes(tag)) return false;
      if (!q) return true;
      return [s.name, s.client ?? '', s.note ?? ''].some((v) => v.toLowerCase().includes(q));
    });
    return [...list].sort((a, b) =>
      sortKey === 'name'
        ? a.name.localeCompare(b.name, 'ru')
        : b.createdAt.localeCompare(a.createdAt),
    );
  }, [sites, query, tag, sortKey]);

  const busy = progress !== null;

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
        <h1 className={styles.title}>Сайты</h1>
        <p className={styles.lead}>
          Готовые статические страницы: залить папкой или архивом, открыть живьём, скачать обратно.
          Внутри сайта пути должны быть относительными — <code>style.css</code>, а не <code>/style.css</code>.
        </p>

        <section className={styles.uploader}>
          <div className={styles.pickRow}>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => folderInput.current?.click()}
              disabled={busy}
            >
              Выбрать папку
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => zipInput.current?.click()}
              disabled={busy}
            >
              Выбрать .zip
            </button>
            {picked && (
              <span className={styles.pickInfo}>
                {picked.length} файл(ов) · {formatBytes(picked.reduce((s, p) => s + p.blob.size, 0))} · старт:{' '}
                <code>{entry}</code>
              </span>
            )}
            {pickError && <span className={styles.error}>{pickError}</span>}
          </div>

          {/* webkitdirectory нет в типах React — отдаём атрибуты как есть */}
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
                  <span className={styles.fieldLabel}>Название *</span>
                  <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Клиент</span>
                  <input className={styles.input} value={client} onChange={(e) => setClient(e.target.value)} disabled={busy} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Теги через запятую</span>
                  <input className={styles.input} value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Заметка</span>
                  <input className={styles.input} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
                </label>
              </div>

              <div className={styles.uploadActions}>
                <button type="button" className={styles.primary} onClick={upload} disabled={busy || !name.trim()}>
                  {busy ? `Загружаю ${progress!.done} из ${progress!.total}…` : 'Загрузить сайт'}
                </button>
                <button type="button" className={styles.ghost} onClick={reset} disabled={busy}>
                  Отменить
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
            placeholder="Поиск по названию, клиенту, заметке…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className={styles.select} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Тег">
            <option value="">Все теги</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className={styles.select}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Сортировка"
          >
            <option value="date">Сначала новые</option>
            <option value="name">По названию</option>
          </select>
          <span className={styles.count}>
            {shown.length === sites.length ? `${sites.length} сайтов` : `показано ${shown.length} из ${sites.length}`}
          </span>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <p className={styles.empty}>Загружаю…</p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>{sites.length ? 'Ничего не найдено' : 'Пока ни одного сайта'}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Клиент</th>
                  <th>Теги</th>
                  <th>Загружен</th>
                  <th>Размер</th>
                  <th>Залил</th>
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
                      <span className={styles.dim}> · {s.fileCount} ф.</span>
                    </td>
                    <td className={styles.dim}>{s.owner ?? '—'}</td>
                    <td className={styles.rowActions}>
                      <a className={styles.action} href={`/s/${encodeURIComponent(s.id)}`} target="_blank" rel="noreferrer">
                        Открыть
                      </a>
                      <a className={styles.action} href={`/api/sites/${encodeURIComponent(s.id)}/download`}>
                        Скачать
                      </a>
                      <button type="button" className={styles.danger} onClick={() => remove(s)}>
                        Удалить
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
