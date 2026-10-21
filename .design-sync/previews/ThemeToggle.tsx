import { ThemeToggle } from 'ai-researcher';

/** Кнопка-цикл: система → светлая → тёмная. Состояние читается из localStorage. */
export const Default = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <ThemeToggle />
    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-45)' }}>
      клик перебирает три состояния
    </span>
  </div>
);
