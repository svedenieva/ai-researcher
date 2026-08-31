import { GET as records } from '../route';
import { attachmentHeader, csvBody, rowsFor } from '@/lib/csv';
import { BASES, baseById } from '@/lib/datasource/bases';
import { getCustomStore } from '@/lib/datasource/customStore';
import type { ColumnDef } from '@/lib/datasource/types';
import { toMarkdown } from '@/lib/research/report';
import { toMarkdownTable } from '@/lib/markdownTable';

// Content-Disposition for a non-CSV download (attachmentHeader hardcodes .csv).
function attachment(name: string, ext: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}.${ext}`;
}

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

export const dynamic = 'force-dynamic';

// Export the current slice to CSV.
//
// Takes the same parameters as /api/records and reuses its handler — so the
// file contains exactly what the person sees on screen, with all filters and
// search applied. This is deliberately unlike Airtable, where a viewer on a
// shared link hits Download CSV and gets records WITHOUT their filters:
// «the CSV downloaded will NOT take into account any of the filters applied».
// A mismatch between the screen and the file is a silent trap; no reason to repeat it.
export async function GET(request: Request): Promise<Response> {
  const res = await records(request);
  if (!res.ok) return res;

  const body = (await res.json()) as {
    columns: ColumnDef[];
    records: Array<Record<string, unknown>>;
    custom?: boolean;
  };

  // long-text isn't shown in the grid but does go into the file: CSV is a
  // channel for exchanging values, not a screenshot. The columns are exactly
  // those the records route returned, so the file matches the screen.
  const columns = body.columns ?? [];
  const table = {
    headers: columns.map((c) => c.label),
    rows: rowsFor(columns, body.records ?? []),
  };

  // filename = base name, so downloads don't pile up as records.csv
  const url = new URL(request.url);
  const baseId = url.searchParams.get('base');
  let name = baseById(baseId).name;
  if (baseId && !BUILTIN_IDS.has(baseId)) {
    try {
      name = (await getCustomStore().getBase(baseId))?.name ?? baseId;
    } catch {
      name = baseId;
    }
  }

  const format = url.searchParams.get('format');

  // Markdown table: the round-trippable «.md» export — the exact inverse of the
  // Markdown import, so a base can be exported and re-imported (decision A). Same
  // slice as the screen, same columns/values as the CSV, just pipe-formatted.
  if (format === 'md') {
    return new Response(toMarkdownTable(table), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': attachment(name, 'md'),
      },
    });
  }

  // Markdown report: a shareable write-up (name → quote → aspects → source),
  // the same slice the screen shows. Not re-importable — a narrative, not a table.
  if (format === 'md-report') {
    const md = toMarkdown(name, columns, body.records ?? []);
    return new Response(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': attachment(`${name} — звіт`, 'md'),
      },
    });
  }

  return new Response(csvBody(table), {
    headers: {
      // charset in the type so the browser doesn't guess; BOM inside for Excel
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': attachmentHeader(name),
    },
  });
}
