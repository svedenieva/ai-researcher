import { useEffect } from 'react';
import { UiProvider, useToast } from 'ai-researcher';

function RaiseToast({ text, action }: { text: string; action?: boolean }) {
  const toast = useToast();
  useEffect(() => {
    toast(text, action ? { action: { label: 'Открыть', onClick: () => {} } } : undefined);
  }, [toast, text, action]);
  return (
    <div style={{ height: 96, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-45)' }}>
      тост поднимается при монтировании
    </div>
  );
}

/** Обычный тост — автоскрытие через 3.5 с. */
export const Toast = () => (
  <UiProvider>
    <RaiseToast text="База «AI-агенты» создана" />
  </UiProvider>
);

/** Тост с действием — живёт дольше (6 с), чтобы кнопку успели нажать. */
export const ToastWithAction = () => (
  <UiProvider>
    <RaiseToast text="Запись перенесена в корзину" action />
  </UiProvider>
);
