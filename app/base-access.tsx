'use client';

import { useEffect, useRef, useState } from 'react';
import { apiJson, apiSend } from '@/lib/api';
import { t as tr, type Lang } from '@/lib/i18n';
import { useToast } from './ui';
import styles from './base-access.module.css';

// ТР-БД-03: владелец выдаёт/отзывает доступ к базе конкретным людям по email.
export default function BaseAccess({ baseId, lang }: { baseId: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const T = (k: string) => tr(lang, k as Parameters<typeof tr>[1]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    apiJson<{ emails?: string[] }>(`/api/bases/access?base=${encodeURIComponent(baseId)}`)
      .then((r) => setEmails(r.emails ?? []))
      .catch(() => setEmails([]));
  }, [open, baseId]);

  const grant = async () => {
    const email = draft.trim().toLowerCase();
    if (!email || busy) return;
    setBusy(true);
    try {
      const r = await apiSend<{ emails: string[] }>('/api/bases/access', 'POST', { base: baseId, email });
      setEmails(r.emails);
      setDraft('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (email: string) => {
    setBusy(true);
    try {
      const r = await apiSend<{ emails: string[] }>('/api/bases/access', 'DELETE', { base: baseId, email });
      setEmails(r.emails);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {T('accButton')}{emails.length ? ` · ${emails.length}` : ''}
      </button>
      {open && (
        <div className={styles.panel} role="dialog">
          <div className={styles.title}>{T('accTitle')}</div>
          <div className={styles.note}>{T('accNote')}</div>
          <div className={styles.addRow}>
            <input
              className={styles.input}
              type="email"
              value={draft}
              placeholder={T('accEmail')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') grant(); }}
            />
            <button type="button" className={styles.addBtn} onClick={grant} disabled={busy || !draft.trim()}>
              {T('accAdd')}
            </button>
          </div>
          {emails.length === 0 ? (
            <div className={styles.empty}>{T('accEmpty')}</div>
          ) : (
            <ul className={styles.list}>
              {emails.map((em) => (
                <li key={em} className={styles.item}>
                  <span className={styles.em}>{em}</span>
                  <button type="button" className={styles.revoke} onClick={() => revoke(em)} disabled={busy}>
                    {T('accRevoke')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
