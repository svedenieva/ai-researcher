// A deliberately small, SAFE Markdown → HTML renderer for the reading view's
// long-text prose (decision A: long-text = markdown). We don't pull a full
// markdown library: this covers headings, bold/italic, inline code, links and
// bullet lists — and, crucially, is XSS-safe by construction. Every piece of
// user text is HTML-escaped first, so raw `<script>` can never reach the DOM; the
// only tags in the output are the ones this function emits, and link hrefs are
// restricted to http/https/mailto. The result is safe to dangerouslySetInnerHTML.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(u: string): string {
  const url = u.trim();
  return /^(https?:|mailto:)/i.test(url) ? url : '';
}

// inline formatting on ALREADY-ESCAPED text, so injected tags can't appear
function inline(escaped: string): string {
  let s = escaped;
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // links [text](url) — url is escaped already; only safe schemes become <a>
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => {
    const url = safeUrl(u);
    return url ? `<a href="${url}" target="_blank" rel="noreferrer noopener">${t}</a>` : t;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s;
}

export function renderMarkdown(src: string): string {
  const lines = String(src ?? '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listOpen = false;
  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') { closeList(); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { closeList(); const lvl = h[1].length; out.push(`<h${lvl}>${inline(escapeHtml(h[2]))}</h${lvl}>`); continue; }

    const li = /^[-*+]\s+(.*)$/.exec(line);
    if (li) {
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(`<li>${inline(escapeHtml(li[1]))}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(escapeHtml(line))}</p>`);
  }
  closeList();
  return out.join('\n');
}
