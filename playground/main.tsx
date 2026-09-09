import '@/app/globals.css';
import { StrictMode, useMemo, useState, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider } from '@/app/lang-provider';
import { UiProvider } from '@/app/ui';
import Page from '@/app/page';

// Удобный плейграунд AI-исследователя: слева — «Весь сайт» и все компоненты,
// справа — выбранное. Всё на настоящих компонентах из app/ и на моках
// (shims/api.ts), с hot-reload — меняешь код, сразу видишь. Компоненты берутся
// из готовых превью .design-sync/previews/*, чтобы плейграунд и то, что уходит
// в Claude Design, были одним и тем же.

type Story = { name: string; Render: () => JSX.Element };
type Entry = { id: string; label: string; site?: boolean; stories: Story[] };

// авто-подхват всех превью: добавил файл в .design-sync/previews — он тут появился
const modules = import.meta.glob('../.design-sync/previews/*.tsx', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

const components: Entry[] = Object.entries(modules)
  .map(([path, mod]) => {
    const label = path.split('/').pop()!.replace('.tsx', '');
    const stories = Object.entries(mod)
      .filter(([k, v]) => typeof v === 'function' && /^[A-Z]/.test(k))
      .map(([k, v]) => ({ name: k, Render: v as () => JSX.Element }));
    return { id: label, label, stories };
  })
  .filter((e) => e.stories.length > 0 && e.id !== 'FullSite')
  .sort((a, b) => a.label.localeCompare(b.label));

const SITE: Entry = { id: '__site', label: '🌐 Весь сайт', site: true, stories: [{ name: 'FullSite', Render: () => <Page /> }] };
const ALL: Entry[] = [SITE, ...components];

class Boundary extends Component<{ children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err)
      return (
        <pre style={{ color: '#e5484d', padding: 20, whiteSpace: 'pre-wrap', font: '13px JetBrains Mono, monospace' }}>
          {String(this.state.err.stack || this.state.err)}
        </pre>
      );
    return this.props.children;
  }
}

function Playground() {
  const [id, setId] = useState(() => location.hash.slice(1) || '__site');
  const entry = useMemo(() => ALL.find((e) => e.id === id) ?? SITE, [id]);
  const pick = (x: string) => {
    setId(x);
    location.hash = x;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <aside
        style={{
          width: 232,
          flex: '0 0 232px',
          overflowY: 'auto',
          padding: '14px 10px',
          background: '#0f1524',
          color: '#e7ecf6',
          borderRight: '1px solid #ffffff14',
        }}
      >
        <div style={{ font: '600 11px/1 JetBrains Mono, monospace', opacity: 0.55, padding: '4px 10px 10px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Playground · {components.length} компонентов
        </div>
        {ALL.map((e) => (
          <button
            key={e.id}
            onClick={() => pick(e.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '9px 11px',
              margin: '2px 0',
              border: 0,
              borderRadius: 9,
              cursor: 'pointer',
              background: e.id === id ? '#4f7cff' : 'transparent',
              color: e.id === id ? '#fff' : '#cdd5e5',
              fontSize: 14,
              fontWeight: e.site ? 600 : 400,
            }}
          >
            {e.label}
          </button>
        ))}
      </aside>

      <main style={{ flex: 1, overflow: 'auto', padding: entry.site ? 0 : 24, background: entry.site ? undefined : '#0b0f1a' }}>
        <Boundary key={entry.id}>
          {entry.stories.map((s) => (
            <section key={s.name} style={{ marginBottom: entry.site ? 0 : 28 }}>
              {!entry.site && (
                <div style={{ font: '600 12px JetBrains Mono, monospace', color: '#7f8aa3', marginBottom: 10 }}>
                  {entry.label} · {s.name}
                </div>
              )}
              <s.Render />
            </section>
          ))}
        </Boundary>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <UiProvider>
        <Playground />
      </UiProvider>
    </LangProvider>
  </StrictMode>,
);
