import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Design playground для AI-исследователя: автономная Vite-оболочка, которая
// рендерит НАСТОЯЩИЕ компоненты из app/ на моках, без Next.js/Supabase — для
// дизайн-ревью через Claude Design. Настоящий код переиспользуется на месте
// (не копируется), поэтому вид/поведение не дрейфуют от приложения.
const ROOT = resolve(__dirname, '..');

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'next/navigation', replacement: resolve(__dirname, 'shims/next-navigation.ts') },
      { find: 'next/link', replacement: resolve(__dirname, 'shims/next-link.tsx') },
      // сетевой слой → in-memory мок (специфичный алиас раньше общего '@/')
      { find: /^@\/lib\/api$/, replacement: resolve(__dirname, 'shims/api.ts') },
      // "ai-researcher" = точка входа дизайн-бандла (та же, что уходит в Claude
      // Design) — превью из .design-sync/previews импортируют компоненты отсюда
      { find: /^ai-researcher$/, replacement: resolve(ROOT, '.design-sync/entry.tsx') },
      // всё остальное '@/...' резолвится в реальный корень репозитория
      { find: /^@\//, replacement: `${ROOT}/` },
    ],
    dedupe: ['react', 'react-dom'],
  },
  // playground рендерит файлы из корня репо (app/, lib/, .design-sync/) — они выше root
  server: { fs: { allow: [ROOT] } },
  build: { outDir: 'dist' },
});
