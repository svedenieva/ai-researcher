'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import styles from './ui.module.css';

// ── Toasts + confirm dialog in the site's own style, replacing the browser's
// window.alert / window.confirm / window.prompt. One provider mounted at the
// root exposes useToast() and useConfirm() to the whole app.

interface ToastAction { label: string; onClick: () => void }
interface Toast { id: number; message: string; action?: ToastAction }

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface ConfirmState extends ConfirmOpts { resolve: (ok: boolean) => void }

interface Ui {
  toast: (message: string, opts?: { action?: ToastAction }) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
}

const UiContext = createContext<Ui>({ toast: () => {}, confirm: async () => false });

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmState | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback((message: string, opts?: { action?: ToastAction }) => {
    const id = ++seq.current;
    setToasts((list) => [...list, { id, message, action: opts?.action }]);
    // auto-hide; a toast with an action gets a little longer to be clicked
    setTimeout(() => dismiss(id), opts?.action ? 6000 : 3500);
  }, [dismiss]);

  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })),
    [],
  );

  const close = useCallback((ok: boolean) => {
    setDialog((d) => { d?.resolve(ok); return null; });
  }, []);

  // Esc / Enter on the open dialog
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}

      <div className={styles.toasts} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>
            <span className={styles.toastMsg}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className={styles.toastAction}
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className={styles.toastClose} onClick={() => dismiss(t.id)} aria-label="Закрити">×</button>
          </div>
        ))}
      </div>

      {dialog && (
        <div className={styles.backdrop} onClick={() => close(false)}>
          <div className={styles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogTitle}>{dialog.title}</div>
            {dialog.message && <div className={styles.dialogMsg}>{dialog.message}</div>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnGhost} onClick={() => close(false)}>
                {dialog.cancelLabel ?? 'Отмена'}
              </button>
              <button
                type="button"
                className={dialog.danger ? styles.btnDanger : styles.btnPrimary}
                onClick={() => close(true)}
                autoFocus
              >
                {dialog.confirmLabel ?? 'ОК'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UiContext.Provider>
  );
}

export function useToast() { return useContext(UiContext).toast; }
export function useConfirm() { return useContext(UiContext).confirm; }
