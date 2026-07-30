import './globals.css';

export const metadata = { title: 'AI-Researcher' };

// Apply the saved theme before the first paint. Without this, a stored
// light/dark choice only took effect after the user clicked the toggle again
// (the attribute was set on click but never on load), and reloads flashed the
// system theme first. Runs synchronously in <head>, ahead of hydration.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
