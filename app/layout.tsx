import './globals.css';
import { LangProvider } from './lang-provider';
import { UiProvider } from './ui';

export const metadata = { title: 'AI-Researcher' };

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
