'use client';

// Search across all of the user's bases at once. Types → debounced call to
// /api/search → a results list (base-name and row hits); picking one switches to
// that base and seeds the grid search so the row is easy to spot.
import { useEffect, useRef, useState } from 'react';
import { apiJson } from '@/lib/api';
import { useLang } from './lang-provider';
import { t as tr } from '@/lib/i18n';
import { IconSearch } from './icons';
import styles from './global-search.module.css';

interface Hit {
  baseId: string;
  baseName: string;
  rowId?: string;
  label: string;
  kind: 'base' | 'row';
}

export default function GlobalSearch({ onNavigate }: { onNavigate: (baseId: string, query: string) => void }) {
  const { lang } = useLang();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => {
      apiJson<{ results?: Hit[] }>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((b) => setResults(b.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  // close the results on an outside click
  useEffect(() => {
    if (results === null) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setResults(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [results]);

  const pick = (h: Hit) => {
    onNavigate(h.baseId, h.kind === 'row' ? q.trim() : '');
    setQ('');
    setResults(null);
  };

  return (
    <div className={styles.wrap} ref={boxRef}>
      <span className={styles.icon} aria-hidden="true"><IconSearch size={14} /></span>
      <input
        className={styles.input}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr(lang, 'globalSearch')}
        aria-label={tr(lang, 'globalSearch')}
      />

      {results !== null && (
        <div className={styles.panel} role="listbox">
          {loading && <p className={styles.hint}>{tr(lang, 'searchSearching')}</p>}
          {!loading && results.length === 0 && <p className={styles.hint}>{tr(lang, 'searchNoResults')}</p>}
          {results.map((h, i) => (
            <button key={`${h.baseId}:${h.rowId ?? 'base'}:${i}`} type="button" className={styles.hit} onClick={() => pick(h)} role="option">
              <span className={styles.hitLabel}>{h.label}</span>
              {h.kind === 'row' && <span className={styles.hitBase}>{h.baseName}</span>}
              {h.kind === 'base' && <span className={styles.hitTag}>base</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
