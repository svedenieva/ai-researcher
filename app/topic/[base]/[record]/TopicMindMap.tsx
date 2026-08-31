'use client';

import dynamic from 'next/dynamic';
import '@xyflow/react/dist/style.css';
import type { MindMapNode } from '@/lib/mindmap/components/mind-map/types';
import styles from './article.module.css';

// The vendored React-Flow canvas is client-only (it touches window/measure on
// mount), so it's loaded with ssr:false — same as its original hosts do.
const RfMindMap = dynamic(
  () => import('@/lib/mindmap/components/mind-map/rf/rf-mind-map').then((m) => ({ default: m.RfMindMap })),
  { ssr: false, loading: () => <div className={styles.canvasLoading}>Загрузка карты…</div> },
);

export default function TopicMindMap({ outline, title }: { outline: MindMapNode[]; title?: string }) {
  return (
    <div className={styles.canvas}>
      <RfMindMap outline={outline} title={title} editable={false} />
    </div>
  );
}
