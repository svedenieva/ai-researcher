import type { Article } from '@/lib/article';
import type { MindMapNode } from './components/mind-map/types';

// §5.5 mind-map at the topic level: turn a built Article into the canvas's tree
// («outline») — a root node for the topic, then a branch per section. Checklist
// items, tags, sources, quotes and links become leaf children, so the whole
// topic reads as one map. The canvas (@xyflow/react) derives its nodes/edges
// from this {name, children} tree.
export function articleToOutline(article: Article): MindMapNode[] {
  const children: MindMapNode[] = [];

  for (const s of article.sections) {
    children.push(
      s.kind === 'checklist'
        ? { name: s.heading, children: (s.items ?? []).map((i) => ({ name: i })) }
        : { name: s.heading },
    );
  }

  if (article.badges.length) {
    children.push({ name: 'Метки', children: article.badges.map((b) => ({ name: b.value })) });
  }
  const { sidebar } = article;
  if (sidebar.sources.length) {
    children.push({ name: 'Источники', children: sidebar.sources.map((s) => ({ name: s })) });
  }
  if (sidebar.quotes.length) {
    children.push({ name: 'Цитаты', children: sidebar.quotes.map((q) => ({ name: q })) });
  }
  if (sidebar.links.length) {
    children.push({ name: 'Ссылки', children: sidebar.links.map((l) => ({ name: l.label })) });
  }

  return [{ name: article.title || 'Тема', children }];
}
