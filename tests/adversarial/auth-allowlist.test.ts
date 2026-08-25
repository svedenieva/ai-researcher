import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowed } from '@/lib/supabase-auth';

// isAllowed — единственный фильтр «кого вообще пускать внутрь». Подсовываем
// адреса, похожие на разрешённые, и смотрим, не примет ли он подделку.

const saved = process.env.ALLOWED_EMAILS;
beforeEach(() => {
  process.env.ALLOWED_EMAILS = 'boss@aivocado.com, Sofiia@AiVocado.com';
});
afterEach(() => {
  if (saved === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = saved;
});

describe('isAllowed — подделка разрешённой почты', () => {
  // если сломается — внутрь заходит любой, кто зарегистрировал похожий домен
  it('поддомен и «домен-хвост» не проходят', () => {
    expect(isAllowed('boss@aivocado.com.evil.com')).toBe(false);
    expect(isAllowed('boss@evil.aivocado.com')).toBe(false);
    expect(isAllowed('boss@aivocado.co')).toBe(false);
  });

  // «@» в локальной части — классический трюк против наивного парсинга
  it('boss@aivocado.com@evil.com не проходит', () => {
    expect(isAllowed('boss@aivocado.com@evil.com')).toBe(false);
    expect(isAllowed('evil.com@boss@aivocado.com')).toBe(false);
  });

  // Google отдаёт почту в нижнем регистре, но список пишут руками
  it('регистр не мешает своим зайти', () => {
    expect(isAllowed('SOFIIA@aivocado.com')).toBe(true);
    expect(isAllowed('boss@AIVOCADO.COM')).toBe(true);
  });

  // омоглифы: кириллическая «о» визуально неотличима от латинской
  it('юникод-омоглиф не выдаёт себя за разрешённый адрес', () => {
    expect(isAllowed('bоss@aivocado.com')).toBe(false);
    expect(isAllowed('boss@aivocadо.com')).toBe(false);
  });

  // пустой / отсутствующий адрес — не «кто угодно»
  it('пустая и отсутствующая почта не проходят', () => {
    expect(isAllowed('')).toBe(false);
    expect(isAllowed(null)).toBe(false);
    expect(isAllowed(undefined)).toBe(false);
  });

  // подстрока разрешённого адреса — не разрешённый адрес
  it('усечённый адрес не проходит', () => {
    expect(isAllowed('oss@aivocado.com')).toBe(false);
    expect(isAllowed('boss@aivocado.co')).toBe(false);
  });

  // мусор по краям и управляющие символы: правильный ответ — отказ (fail-closed)
  it('адрес с пробелами и переводом строки не проходит', () => {
    expect(isAllowed('  boss@aivocado.com  ')).toBe(false);
    expect(isAllowed('boss@aivocado.com\nevil@x.com')).toBe(false);
  });
});

describe('isAllowed — пустой список', () => {
  // задокументированное поведение: пустой ALLOWED_EMAILS = «любой вошедший
  // Google-аккаунт». Фиксируем явно, чтобы случайная потеря переменной была
  // видна как смена модели доступа, а не как невидимое открытие витрины.
  it('пустой ALLOWED_EMAILS пускает любого вошедшего', () => {
    process.env.ALLOWED_EMAILS = '';
    expect(isAllowed('anyone@gmail.com')).toBe(true);
  });

  // аккаунт БЕЗ почты пускать нельзя даже при пустом списке: весь остальной код
  // делит данные по email, а owner === null означает «база, видимая всем»
  it('аккаунт без почты не должен считаться разрешённым', () => {
    process.env.ALLOWED_EMAILS = '';
    expect(isAllowed(null)).toBe(false);
    expect(isAllowed('')).toBe(false);
  });
});
