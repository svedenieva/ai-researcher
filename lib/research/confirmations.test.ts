import { describe, it, expect } from 'vitest';
import { countConfirmations, domainOf, DEFAULT_THRESHOLD } from './confirmations';

const columns = [
  { key: 'название', label: 'Название' },
  { key: 'источники', label: 'Источники' },
];
const row = (thesis: string, src: string) => ({ id: Math.random().toString(), название: thesis, источники: src });

describe('domainOf', () => {
  it('strips scheme, www, port, path', () => {
    expect(domainOf('https://www.reddit.com/r/ai/x')).toBe('reddit.com');
    expect(domainOf('http://x.com:8080/a')).toBe('x.com');
    expect(domainOf('not a url')).toBeNull();
  });
});

describe('countConfirmations', () => {
  it('counts DISTINCT domains per thesis and sorts desc', () => {
    const rows = [
      row('HeyGen', 'https://a.com/1'),
      row('HeyGen', 'https://b.com/2'),
      row('HeyGen', 'https://a.com/3'), // same domain as first — not a new confirmation
      row('Synthesia', 'https://a.com'),
    ];
    const res = countConfirmations(rows, columns, { threshold: 2 });
    expect(res[0].thesis).toBe('HeyGen');
    expect(res[0].count).toBe(2); // a.com + b.com
    expect(res[0].passes).toBe(true); // 2 >= 2
    expect(res[1].thesis).toBe('Synthesia');
    expect(res[1].count).toBe(1);
    expect(res[1].passes).toBe(false);
  });

  it('default threshold is 5', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row('T', `https://d${i}.com`));
    const res = countConfirmations(rows, columns);
    expect(DEFAULT_THRESHOLD).toBe(5);
    expect(res[0].count).toBe(5);
    expect(res[0].passes).toBe(true);
  });

  it('groups case-insensitively by thesis name', () => {
    const res = countConfirmations([row('AI', 'https://a.com'), row('ai', 'https://b.com')], columns, { threshold: 2 });
    expect(res).toHaveLength(1);
    expect(res[0].count).toBe(2);
  });
});
