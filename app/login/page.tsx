'use client';

import { useState } from 'react';
import { createClientForBrowser } from '@/lib/supabase-auth';

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
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--paper)',
        color: 'var(--ink)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          padding: '32px 28px',
          background: 'var(--paper-raised)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-card), var(--ring)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display), Georgia, serif', fontSize: 22 }}>
          AI-Researcher
        </h1>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--ink-45)' }}>
          База знаний · Продукты и конкуренты
        </p>
        <button
          type="button"
          onClick={signIn}
          disabled={busy}
          style={{
            width: '100%',
            padding: '11px 16px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--rule)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontSize: 14,
            fontWeight: 500,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Переход к Google…' : 'Войти через Google'}
        </button>
      </div>
    </main>
  );
}
