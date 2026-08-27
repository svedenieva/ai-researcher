import { describe, it, expect } from 'vitest';
import { toMarkdown } from './report';

describe('toMarkdown', () => {
  const columns = [
    { key: 'название', label: 'Название' },
    { key: 'цена', label: 'Цена' },
    { key: 'цитата', label: 'Цитата' },
    { key: 'источники', label: 'Источники' },
    { key: '__source', label: 'З бази' },
  ];

  it('renders name as heading, quote as blockquote, aspects as bullets, link at the end', () => {
    const md = toMarkdown('Мой отчёт', columns, [
      { название: 'Synthesia', цена: 'от $29/мес', цитата: 'Create AI videos in minutes', источники: 'см. https://synthesia.io/pricing' },
    ]);
    expect(md).toContain('# Мой отчёт');
    expect(md).toContain('## Synthesia');
    expect(md).toContain('> Create AI videos in minutes');
    expect(md).toContain('- **Цена:** от $29/мес');
    expect(md).toContain('[Источник](https://synthesia.io/pricing)');
    // __-prefixed and the name/quote/link columns are not repeated as bullets
    expect(md).not.toContain('- **З бази');
    expect(md).not.toContain('- **Название');
    expect(md).not.toContain('- **Цитата');
  });

  it('omits empty parts and still separates rows', () => {
    const md = toMarkdown('R', columns, [
      { название: 'Bare', цена: '', цитата: '', источники: '' },
    ]);
    expect(md).toContain('## Bare');
    expect(md).not.toContain('>'); // no quote
    expect(md).not.toContain('[Источник]'); // no link
    expect(md).toContain('---');
  });
});
