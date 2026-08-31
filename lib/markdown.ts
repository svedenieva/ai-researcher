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

function anchor(url: string, text: string): string {
  return `<a href="${url}" target="_blank" rel="noreferrer noopener">${text}</a>`;
}

// A sentinel that cannot occur in escaped prose (escapeHtml never emits it, and
// the source is Markdown typed by people, never binary), so held slots survive
// the formatting passes untouched and the digits inside them aren't mistaken for
// content. Built at runtime so no control byte lives in this source file.
const H = String.fromCharCode(0);
const HELD = new RegExp(`${H}(\\d+)${H}`, 'g');
const BARE_URL = new RegExp(`https?://[^\\s<${H}]+`, 'g');

// inline formatting on ALREADY-ESCAPED text, so injected tags can't appear.
// Code spans and links are lifted out to placeholders first, so their contents
// are never re-processed (a URL inside `code` isn't auto-linked, a markdown
// link's target isn't linked twice), then restored at the end.
function inline(escaped: string): string {
  const held: string[] = [];
  const hold = (html: string) => `${H}${held.push(html) - 1}${H}`;

  let s = escaped;
  // inline code first — nothing inside it is touched again
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => hold(`<code>${c}</code>`));
  // explicit markdown links [text](url); only safe schemes become anchors
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => {
    const url = safeUrl(u);
    return url ? hold(anchor(url, t)) : t;
  });
  // bare URLs left in the prose become links too. Trailing punctuation (and a
  // closing paren) is left out of the link and kept as text.
  s = s.replace(BARE_URL, (m: string) => {
    const url = m.replace(/[.,;:!?)]+$/, '');
    const tail = m.slice(url.length);
    return hold(anchor(url, url.replace(/^https?:\/\//, ''))) + tail;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  // restore held code/link html
  return s.replace(HELD, (_m, i: string) => held[Number(i)]);
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
