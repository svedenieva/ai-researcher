'use client';

// The wrapper every preview renders inside. Mirrors app/layout.tsx: LangProvider
// supplies the locale that every component reads through useLang(), UiProvider
// supplies the toast and confirm channels that BaseTree, BaseAccess and
// CreateBase call into. A component rendered outside these two still mounts,
// but falls back to the default locale and silently drops its toasts.
import type { ReactNode } from 'react';
import { LangProvider } from '../app/lang-provider';
import { UiProvider } from '../app/ui';

export function DsProvider({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <UiProvider>{children}</UiProvider>
    </LangProvider>
  );
}
