'use client';

import { useState } from 'react';
import { createClientForBrowser } from '@/lib/supabase-auth';
import styles from './login.module.css';

export default function Login() {
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    const supabase = createClientForBrowser();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <h1 className={styles.title}>AI-Researcher</h1>
        <p className={styles.sub}>База знань · Продукти та конкуренти</p>
        <button type="button" onClick={signIn} disabled={busy} className={styles.btn}>
          {busy ? 'Перехід до Google…' : 'Увійти через Google'}
        </button>
      </div>
    </main>
  );
}
