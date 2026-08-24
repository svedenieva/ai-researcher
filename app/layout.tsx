import './globals.css';
import { LangProvider } from './lang-provider';
import { UiProvider } from './ui';

export const metadata = {
  title: 'AiS · AI Researcher',
  description: 'Базы знаний AiVocado: компании, продукты и исследования в одном месте.',
};

// Apply the saved theme before the first paint. Without this, a stored
// light/dark choice only took effect after the user clicked the toggle again
// (the attribute was set on click but never on load), and reloads flashed the
// system theme first. Runs synchronously in <head>, ahead of hydration.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // the pre-hydration script sets data-theme before React hydrates, so the
    // server/client <html> attributes differ by design — silence that warning.
    <html lang="uk" suppressHydrationWarning>
      <head>
        {/* Plus Jakarta Sans (UI/headings) + JetBrains Mono (data/labels).
            A plain stylesheet link — the project deliberately avoids next/font.
            @mindsheet reads the same --font-* vars, so the grid restyles too. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LangProvider>
          <UiProvider>{children}</UiProvider>
        </LangProvider>
      </body>
    </html>
  );
}
