// Schemes allowed in a url-typed cell. The value ends up in an anchor's href,
// so anything the browser will execute in page context (javascript:, data: with
// an html payload, vbscript:) is a stored-XSS vector: the code then runs on our
// own origin with the viewer's session.
//
// A bare value with no scheme (example.com, /page, ./file) is left alone — it is
// not executable and rejecting it would break ordinary paste-a-link usage.
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function isSafeUrlValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  const s = String(value).trim();
  // control characters are how "java\nscript:" slips past a naive scheme check
  const bare = s.replace(/[\u0000-\u0020]/g, '');
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(bare);
  if (!m) return true; // relative or scheme-less — nothing to execute
  return ALLOWED_SCHEMES.has(`${m[1].toLowerCase()}:`);
}
