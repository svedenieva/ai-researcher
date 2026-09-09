'use client';

// One browsable card for the whole icon set. The icons themselves are ordinary
// exports (window.AiResearcherDS.IconFolder and friends) — this component only
// exists so humans get a single place to see all 27 at once, instead of 27
// near-identical cards in the component picker.
import * as Icons from '../../app/icons';

type IconCmp = (p: { size?: number }) => JSX.Element;

const ENTRIES = Object.entries(Icons)
  .filter(([name]) => name.startsWith('Icon'))
  .sort(([a], [b]) => a.localeCompare(b)) as [string, IconCmp][];

export function IconGallery({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
        gap: 8,
        fontFamily: 'var(--font-ui)',
        color: 'var(--ink)',
      }}
    >
      {ENTRIES.map(([name, Icon]) => (
        <div
          key={name}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '12px 6px',
            border: '1px solid var(--rule-soft)',
            borderRadius: 10,
            background: 'var(--paper-raised)',
          }}
        >
          <Icon size={size} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--ink-45)',
              textAlign: 'center',
              wordBreak: 'break-word',
            }}
          >
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}
