'use client';

// Saved views: named presets of a base's filters + sort + grouping + search,
// kept per base in localStorage. Column widths / colours already persist on
// their own (mindsheet), so a view here is the data *slice*, not the styling.
import { useCallback, useEffect, useState } from 'react';
import type { ListParams } from '@/lib/datasource/types';
import { useLang } from './lang-provider';
import { t as tr } from '@/lib/i18n';
import { IconTrash } from './icons';
import styles from './saved-views.module.css';

type Sort = ListParams['sort'];
export interface SavedView {
  name: string;
  sort: Sort;
  extraLevels: NonNullable<Sort>[];
  filters: Record<string, string>;
  search: string;
}

interface Props {
  base: string;
  sort: Sort;
  extraLevels: NonNullable<Sort>[];
  filters: Record<string, string>;
  search: string;
  onApply: (v: SavedView) => void;
}

export default function SavedViews({ base, sort, extraLevels, filters, search, onApply }: Props) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState('');
  const key = `ais:views:${base}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setViews(raw ? (JSON.parse(raw) as SavedView[]) : []);
    } catch {
      setViews([]);
    }
  }, [key]);

  const persist = useCallback(
    (next: SavedView[]) => {
      setViews(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* private mode — the preset just won't survive a reload */
      }
    },
    [key],
  );

  const saveCurrent = () => {
    const n = name.trim();
    if (!n) return;
    // replace a same-named preset rather than duplicate it
    persist([...views.filter((v) => v.name !== n), { name: n, sort, extraLevels, filters, search }]);
    setName('');
  };

  const activeCount = Object.keys(filters).length + (search.trim() ? 1 : 0) + (sort ? 1 : 0) + extraLevels.length;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={tr(lang, 'savedViews')}
      >
        {tr(lang, 'savedViews')}
        {views.length > 0 && <span className={styles.count}>{views.length}</span>}
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={styles.menu} role="dialog" aria-label={tr(lang, 'savedViews')}>
            {views.length === 0 && <p className={styles.empty}>{tr(lang, 'noSavedViews')}</p>}
            {views.map((v) => (
              <div key={v.name} className={styles.row}>
                <button
                  type="button"
                  className={styles.apply}
                  onClick={() => {
                    onApply(v);
                    setOpen(false);
                  }}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  className={styles.del}
                  onClick={() => persist(views.filter((x) => x.name !== v.name))}
                  aria-label={`${tr(lang, 'savedViews')}: ${v.name}`}
                  title="✕"
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}

            <form
              className={styles.saveRow}
              onSubmit={(e) => {
                e.preventDefault();
                saveCurrent();
              }}
            >
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr(lang, 'saveViewPlaceholder')}
              />
              <button type="submit" className={styles.save} disabled={!name.trim() || activeCount === 0}>
                {tr(lang, 'saveViewBtn')}
              </button>
            </form>
            <p className={styles.note}>{tr(lang, 'saveViewNote')}</p>
          </div>
        </>
      )}
    </div>
  );
}
