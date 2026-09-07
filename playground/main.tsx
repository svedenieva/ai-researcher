import '@/app/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider } from '@/app/lang-provider';
import { UiProvider } from '@/app/ui';
import Page from '@/app/page';

// Настоящая главная страница исследователя внутри её реальных провайдеров
// (язык + тосты/подтверждения), но на мок-данных (см. shims/api.ts).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <UiProvider>
        <Page />
      </UiProvider>
    </LangProvider>
  </StrictMode>,
);
