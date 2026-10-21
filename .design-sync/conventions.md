## How to build with AI Researcher

This is the component surface of **AI Исследователь** (AiVocado) — a knowledge-base
app for cataloguing AI/IT products. Its UI is Russian/Ukrainian first; write copy in
Russian unless the composition says otherwise.

### Wrap everything in `DsProvider`

```jsx
const { DsProvider, BaseTree, KnowledgeCards } = window.AiResearcherDS;

<DsProvider>
  <BaseTree tabs={tabs} base="agents" onPick={pick} onClose={close} onCreate={create} embedded />
</DsProvider>
```

`DsProvider` composes the app's two real providers, `LangProvider` and `UiProvider`
(both are exported separately if you need them apart). Skipping it does not crash the
tree, it degrades it silently in two ways worth knowing:

- Every component reads its copy through `useLang()`. Without `LangProvider` they all
  fall back to Ukrainian (`DEFAULT_LANG = 'uk'`) and stop reacting to `LangSwitch`.
- `BaseTree`, `BaseAccess` and `CreateBase` report the result of every action through
  `useToast()` / `useConfirm()`. Without `UiProvider` those calls no-op — a delete
  looks like it did nothing, and the confirm step that guards it never appears.

Components that take a `lang` prop directly (`KnowledgeCards`, `StagesPanel`,
`ConfirmationsPanel`, `SourceCounters`, `FilterConditions`, `BaseAccess`) accept
`'uk' | 'ru' | 'en'` and ignore the provider for their own copy.

### There are no utility classes — style with the token variables

This system has no Tailwind, no class vocabulary, and no style props. Components carry
their own CSS Modules; **your** layout glue is written with plain CSS referencing the
same custom properties the components use. Never invent a class name — it will not
resolve to anything.

| Purpose | Tokens |
|---|---|
| Type | `--font-ui`, `--font-sans`, `--font-display` (DM Sans), `--font-mono` (JetBrains Mono, for data and labels) |
| Text | `--ink`, `--ink-70`, `--ink-45`, `--ink-25` (primary → faintest) |
| Surfaces | `--paper` (page), `--paper-raised` (card, menu), `--wash` (inset), `--tint` |
| Borders | `--rule`, `--rule-soft` |
| Accent | `--sage`, `--sage-soft`, `--sage-hover` (the product's blue — the name is historical) |
| Base tone | `--tone-sage`, `--tone-teal`, `--tone-blue`, `--tone-amber` — the colour a knowledge base carries through the tree |
| Attention | `--warn`, `--warn-tint`, `--warn-row`, `--warn-dot`, `--error` |
| Chart segments | `--seg-1` … `--seg-6`, cycled by index for dynamic facets |
| Shape & depth | `--radius`, `--radius-lg`, `--badge-radius`, `--shadow-card`, `--shadow-panel`, `--ring` |
| Glass | `--glass-bg`, `--glass-blur`, `--glass-hover`, `--gradient-header` |

Every colour token is defined with CSS `light-dark()`, so **one value covers both
themes** — never write a dark-mode override, and never hardcode a hex. The theme is an
attribute on `<html>` (`data-theme="light" | "dark"`, absent = system), which
`ThemeToggle` cycles.

### Where the truth lives

- `styles.css` — the single stylesheet entry; it `@import`s the token layer and the
  component styles. Read it before styling anything.
- `fonts/fonts.css` — the shipped brand faces. Note DM Sans has no Cyrillic upstream,
  so Cyrillic UI text renders in the system sans exactly as it does in production.
- `components/<group>/<Name>/<Name>.prompt.md` — what each component is for; the
  matching `.d.ts` is the prop contract. Prefer both over guessing.

### Data shape

Most components are driven by two structures rather than by many props:

- `ColumnDef` — `{ key, label, type, filterable?, badge?, defaultGroup?, order? }`,
  where `type` is one of `text | number | long-text | url | select | multiselect |
  date | checkbox | rating`. Columns marked `filterable` are what turn on filtering
  and grouping; `defaultGroup` picks the column a base opens grouped by.
- `CatalogRecord` — `{ id, [columnKey]: string | number | null }`. Keys prefixed with
  `__` (`__updated`, `__created`, `__source`) are system fields and are never shown as
  columns.

Pass real column definitions rather than hardcoding fields: `KnowledgeCards`,
`BaseSummary`, `StagesPanel` and `SourceCounters` all decide what to show by
inspecting `columns`, so a design built on invented keys will render empty panels.

### An idiomatic composition

```jsx
const { DsProvider, BasePicker, BaseSummary, KnowledgeCards } = window.AiResearcherDS;

<DsProvider>
  <div style={{ background: 'var(--paper)', padding: 24, fontFamily: 'var(--font-ui)' }}>
    <BasePicker tabs={tabs} base="agents" onChange={setBase} onCreate={openCreate} />
    <BaseSummary columns={columns} records={records} total={148} />
    <KnowledgeCards records={records} columns={columns} lang="ru" tone="teal" onOpen={openRecord} />
  </div>
</DsProvider>
```
