# Language Switcher (i18n) — Design

**Date:** 2026-08-07
**Status:** Approved for planning
**Topic:** Add a UI language switcher — Ukrainian, Russian, English — to the AI-Researcher web app, defaulting to Ukrainian.

---

## 1. Problem

The app's interface is hard-coded in Russian (`<html lang="ru">`, literal strings across ~10 `app/**/*.tsx` files). Users need to choose the interface language between **Ukrainian, Russian, and English**, with the choice remembered.

## 2. Goals

1. A switcher control (header, beside the theme toggle) offering **Українська · Русский · English**.
2. **Ukrainian is the default** on first visit; the choice persists across visits.
3. All app-chrome UI strings render in the chosen language.
4. A missing translation can never ship silently — caught by a test.

## 3. Non-Goals (YAGNI)

- **Translating the MindSheet table package** (~213 strings in the separate `@aivocado/mindsheet` repo). Deferred to a follow-up; the grid stays Russian in v1. (Noted as a known inconsistency.)
- **Translating data/content** — base names, catalog companies, research output. That's real domain data; machine-translating it would corrupt the knowledge base.
- **Locale-routed URLs** (`/uk`, `/ru`, `/en`) and server-side i18n. A client toggle over ~10 files doesn't need routing machinery.
- **A translation-management library** (next-intl, react-intl, lingui). A plain dictionary + context is enough at this size.

## 4. Approach

**Lightweight custom i18n via React context + `localStorage`**, mirroring the existing `app/theme-toggle.tsx` pattern (client-side, persisted, sets a `<html>` attribute).

Rejected alternatives: `next-intl` with locale routing (overkill — adds URL/routing/server machinery for a client toggle); importing the dictionary directly without context (no reactivity — components wouldn't re-render on switch).

## 5. Components

### 5.1 `lib/i18n/dictionaries.ts`
One object, three same-shaped maps:

```ts
export type Lang = 'uk' | 'ru' | 'en';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'uk', label: 'Українська' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
];
export const DEFAULT_LANG: Lang = 'uk';

export const dictionaries: Record<Lang, Record<string, string>> = {
  uk: { /* Ukrainian */ },
  ru: { /* current hard-coded strings, extracted verbatim */ },
  en: { /* English */ },
};
```

Keys are dot-namespaced by area, e.g. `nav.sites`, `nav.newResearch`, `nav.csv`, `bin.title`, `bin.empty`, `bin.restore`, `createBase.*`, `research.*`, `login.*`, `picker.*`, `product.*`. The **`ru` map is the source of truth for wording** (extracted from today's code); `uk`/`en` are translations of it.

### 5.2 `lib/i18n/LanguageProvider.tsx` (client component)
- Holds current `Lang` in state; initial value `DEFAULT_LANG` (uk) for SSR, then reads `localStorage['air-lang']` on mount and applies it (mirrors theme's mount-time read).
- On change: writes `localStorage`, sets `document.documentElement.lang`, updates state.
- Exposes `useLang()` → `{ lang, setLang }` and `useT()` → `t(key: string): string`.
- **Fallback chain in `t`:** chosen lang → `DEFAULT_LANG` (uk) → the key string itself. So a missing key degrades to Ukrainian, then to a visible key (never blank).

### 5.3 `app/language-toggle.tsx` (+ `.module.css`)
Compact control in the header next to `ThemeToggle`: three options by native label, current one marked. Calls `setLang`. Segmented control or small dropdown (implementer's choice, matching header styling).

### 5.4 Wiring
- `app/layout.tsx` wraps `{children}` in `<LanguageProvider>` and keeps `suppressHydrationWarning` on `<html>` (already present) for the lang attribute.
- The 10 text-bearing files replace literals with `t('key')`; headers that show nav (page.tsx, sites, research) render `<LanguageToggle/>`.

## 6. Data Flow

```
first visit ─► DEFAULT_LANG=uk ─► render
returning ─► mount reads localStorage['air-lang'] ─► setLang ─► re-render + <html lang> updated
user clicks switcher ─► setLang(code) ─► localStorage write + <html lang> + context re-render ─► all t() update
```

## 7. Files

**New:** `lib/i18n/dictionaries.ts`, `lib/i18n/LanguageProvider.tsx`, `lib/i18n/dictionaries.test.ts`, `app/language-toggle.tsx`, `app/language-toggle.module.css`.

**Modified:** `app/layout.tsx` (provider), and string extraction in: `app/page.tsx`, `app/base-picker.tsx`, `app/base-tree.tsx`, `app/bin/page.tsx`, `app/create-base.tsx`, `app/login/page.tsx`, `app/product/[id]/page.tsx`, `app/research/page.tsx`, `app/sites/page.tsx`.

## 8. Testing

- **Key-parity test (`dictionaries.test.ts`, primary safeguard):** assert `uk`, `ru`, `en` have byte-identical key sets — any key present in one but missing in another fails the suite. This is what makes "no silent missing translation" real.
- **Fallback test:** `t()` for an unknown key returns the key; for a key missing only in the active lang, returns the Ukrainian value.
- **Provider test:** `setLang` updates the value `useT()` resolves and persists to `localStorage`.
- Existing suite stays green; `npx tsc --noEmit` clean.
- Browser smoke is limited (app behind Google OAuth) — deferred to a signed-in manual pass; the key-parity test carries the automated confidence.

## 9. Branch & Process

- **New branch `feature/i18n-language-switcher`, cut from the current `feature/crud-parity-recycle-bin` tip** — so the switcher also covers the new Bin/delete UI strings, and development is isolated from the concurrent session still editing those files on the CRUD branch.
- **Translation review gate:** the implementation produces UK + EN drafts; before merge, they're surfaced (in the spec/PR and a checklist) for the user's correction pass, Ukrainian domain terms especially.

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Concurrent session edits the same 10 files | Separate branch isolates dev; reconcile at merge. Extract strings in one focused pass to shrink the conflict window. |
| Hydration flash for non-default-language returning users | Accepted, same as the existing theme toggle; default (uk) renders first, saved choice applies on mount. |
| Missing/!uneven translations | Key-parity test fails the build; fallback chain prevents blanks at runtime. |
| Grid stays Russian (mixed UI) | Explicit non-goal for v1; follow-up can add a `labels`/`locale` prop to the MindSheet package. |
| Draft translation quality (esp. Ukrainian) | User review gate before merge. |

## 11. Open Questions

None blocking. Follow-up (not this spec): translating the MindSheet grid package via a labels/locale prop.
