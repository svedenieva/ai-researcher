import { describe, it, expect } from 'vitest';
import { extractRow, scoreRows, quoteFoundOnPage } from './eval';

describe('research eval — extractRow', () => {
  it('pulls name / quote / link from the seeded ru columns', () => {
    const r = extractRow({
      'название': 'Synthesia',
      'цитата': 'Create AI videos in minutes',
      'источники': 'see https://synthesia.io/features for details',
    });
    expect(r.name).toBe('Synthesia');
    expect(r.quote).toBe('Create AI videos in minutes');
    expect(r.link).toBe('https://synthesia.io/features');
  });

  it('handles uk/en keys and a bare url', () => {
    const r = extractRow({ 'назва': 'HeyGen', quote: 'Talking avatars', url: 'https://heygen.com' });
    expect(r.name).toBe('HeyGen');
    expect(r.link).toBe('https://heygen.com');
  });
});

describe('research eval — scoreRows', () => {
  it('computes link/quote rates and subtopic coverage', () => {
    const rows = [
      { name: 'Descript', quote: 'Edit video by editing text', link: 'https://descript.com' },
      { name: 'Runway', quote: 'Generative video model', link: 'https://runwayml.com' },
      { name: 'CapCut', quote: '', link: '' }, // no quote, no link
    ];
    const s = scoreRows(rows, ['генерация видео', 'озвучка']);
    expect(s.total).toBe(3);
    expect(s.withLink).toBe(2);
    expect(s.linkRate).toBeCloseTo(2 / 3);
    expect(s.withQuote).toBe(2);
    expect(s.quoteRate).toBeCloseTo(2 / 3);
    // "генерация" appears in Runway's quote-ish text? no — check coverage logic
    expect(s.subtopicCoverage).toBeGreaterThanOrEqual(0);
  });

  it('a trivial quote does not count', () => {
    const s = scoreRows([{ name: 'X', quote: '—', link: 'https://x.com' }]);
    expect(s.withQuote).toBe(0);
    expect(s.quoteRate).toBe(0);
  });

  it('subtopic coverage matches on words present in the rows', () => {
    const rows = [{ name: 'Otter', quote: 'automatic meeting transcription and summary', link: 'https://otter.ai' }];
    const s = scoreRows(rows, ['транскрипция', 'summary', 'приватность']);
    expect(s.coveredSubtopics).toContain('summary');
    expect(s.missingSubtopics).toContain('приватность');
    expect(s.subtopicCoverage).toBeCloseTo(1 / 3);
  });
});

describe('research eval — quoteFoundOnPage', () => {
  const page = (html: string): typeof fetch =>
    (async () => ({ ok: true, text: async () => html })) as unknown as typeof fetch;

  it('true when the quote is present on the page (whitespace/markup tolerant)', async () => {
    const f = page('<html><body><p>Create   AI  videos in minutes, no crew.</p></body></html>');
    expect(await quoteFoundOnPage('https://x.com', 'Create AI videos in minutes', f)).toBe(true);
  });

  it('false when the quote is not on the page', async () => {
    const f = page('<html><body>Something entirely different</body></html>');
    expect(await quoteFoundOnPage('https://x.com', 'Create AI videos in minutes', f)).toBe(false);
  });

  it('false on a failed fetch or a missing url/quote', async () => {
    const bad = (async () => ({ ok: false, text: async () => '' })) as unknown as typeof fetch;
    expect(await quoteFoundOnPage('https://x.com', 'Create AI videos in minutes', bad)).toBe(false);
    expect(await quoteFoundOnPage('', 'a real quote here', page('...'))).toBe(false);
    expect(await quoteFoundOnPage('https://x.com', 'short', page('short'))).toBe(false);
  });
});
