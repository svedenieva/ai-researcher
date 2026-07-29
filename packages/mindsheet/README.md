# @aivocado/mindsheet

Portable, data-agnostic table for any AiVocado site (Fathom, Researcher, …).
It knows nothing about data sources — you feed it `columns` + `records` and
handle sort/filter callbacks. One component, deployed everywhere.

## Use

```tsx
import { MindSheet } from '@aivocado/mindsheet';
import type { ColumnDef, Row, SortState, FilterState } from '@aivocado/mindsheet';

<MindSheet
  columns={columns}      // ColumnDef[]
  records={rows}         // Row[]  (each { id, ...cells })
  sort={sort}            // SortState | undefined
  filter={filter}        // FilterState | undefined
  onSortChange={(key) => /* toggle/set sort */}
  onFilterChange={(f) => /* set or clear filter */}
/>
```

The host owns the data and the sort/filter state; the component only renders
and emits events. Any storage (Supabase, JSON, an API) works as long as it
produces `ColumnDef[]` + `Row[]`.
