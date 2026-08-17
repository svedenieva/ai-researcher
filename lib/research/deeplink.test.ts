import { describe, it, expect } from 'vitest';
import { researchInstruction, researchDeeplinks } from './deeplink';

describe('deeplink исследования (Вариант C)', () => {
  it('инструкция содержит тему и id базы запуска и просит add_rows', () => {
    const ins = researchInstruction('AI для видеомонтажа', 'иссл-123');
    expect(ins).toContain('AI для видеомонтажа');
    expect(ins).toContain('иссл-123');
    expect(ins).toContain('add_rows');
    expect(ins).toContain('catalog_search');
  });

  it('deeplink: web — universal-ссылка, desktop — схема claude://, q закодирован', () => {
    const { web, desktop, instruction } = researchDeeplinks('тема', 'base-1');
    expect(web.startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(desktop.startsWith('claude://claude.ai/new?q=')).toBe(true);
    // q — URL-encoded, без сырых пробелов/кавычек
    const q = web.split('?q=')[1];
    expect(q).not.toContain(' ');
    expect(decodeURIComponent(q)).toBe(instruction);
  });

  it('промпт укладывается в лимит q (~14000 символов)', () => {
    const { instruction } = researchDeeplinks('x'.repeat(200), 'b');
    expect(instruction.length).toBeLessThan(14000);
  });
});
