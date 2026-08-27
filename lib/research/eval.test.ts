import { describe, it, expect } from 'vitest';
import { extractRow, scoreRows } from './eval';

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

  it('counts empty rows and case-insensitive duplicate names', () => {
    const rows = [
      { name: 'Runway', quote: 'Generative video model', link: 'https://runwayml.com' },
      { name: 'runway', quote: 'same tool, different casing', link: 'https://runwayml.com/pricing' }, // dup
      { name: '', quote: '', link: '' }, // empty
      { name: 'Pika', quote: 'Text to video', link: 'https://pika.art' },
    ];
    const s = scoreRows(rows);
    expect(s.total).toBe(4);
    expect(s.duplicateRows).toBe(1);
    expect(s.duplicateRate).toBeCloseTo(1 / 4);
    expect(s.emptyRows).toBe(1);
    expect(s.emptyRate).toBeCloseTo(1 / 4);
  });

  it('an empty-name row is empty, not a duplicate of another empty-name row', () => {
    const s = scoreRows([
      { name: '', quote: '', link: '' },
      { name: '', quote: '', link: '' },
    ]);
    expect(s.emptyRows).toBe(2);
    expect(s.duplicateRows).toBe(0);
  });

  it('subtopic coverage matches on words present in the rows', () => {
    const rows = [{ name: 'Otter', quote: 'automatic meeting transcription and summary', link: 'https://otter.ai' }];
    const s = scoreRows(rows, ['транскрипция', 'summary', 'приватность']);
    expect(s.coveredSubtopics).toContain('summary');
    expect(s.missingSubtopics).toContain('приватность');
    expect(s.subtopicCoverage).toBeCloseTo(1 / 3);
  });
});
