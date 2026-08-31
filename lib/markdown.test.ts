import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown — minimal & safe', () => {
  it('renders headings, bold, italic, code and paragraphs', () => {
    expect(renderMarkdown('# Заголовок')).toBe('<h1>Заголовок</h1>');
    expect(renderMarkdown('**жирный**')).toBe('<p><strong>жирный</strong></p>');
    expect(renderMarkdown('обычный `код` тут')).toContain('<code>код</code>');
  });

  it('renders a bullet list', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
  });

  it('renders a safe http link', () => {
    const out = renderMarkdown('[сайт](https://x.example)');
    expect(out).toContain('href="https://x.example"');
    expect(out).toContain('>сайт</a>');
  });

  it('ESCAPES raw HTML — no injection', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('STRIPS a javascript: link to plain text (only http/https/mailto allowed)', () => {
    const out = renderMarkdown('[x](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<a ');
    expect(out).toContain('x');
  });

  it('auto-links a bare URL in prose', () => {
    const out = renderMarkdown('см https://a.example/page тут');
    expect(out).toContain('href="https://a.example/page"');
    expect(out).toContain('>a.example/page</a>');
  });

  it('does not double-link a markdown link, and keeps its text', () => {
    const out = renderMarkdown('[сайт](https://x.example)');
    expect(out).toBe('<p><a href="https://x.example" target="_blank" rel="noreferrer noopener">сайт</a></p>');
  });

  it('drops trailing punctuation from an auto-linked URL', () => {
    const out = renderMarkdown('источник (https://a.example/x).');
    expect(out).toContain('href="https://a.example/x"');
    expect(out).not.toContain('href="https://a.example/x)"');
    expect(out).toContain(').'); // the punctuation stays as text
  });

  it('does not auto-link a URL inside inline code', () => {
    const out = renderMarkdown('`https://a.example`');
    expect(out).toContain('<code>https://a.example</code>');
    expect(out).not.toContain('<a ');
  });
});
