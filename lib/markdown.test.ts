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
});
