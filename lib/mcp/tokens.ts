// Personal access tokens for the HTTP MCP connector, configured as the
// MCP_TOKENS env var: "token:email,token2:email2".
//
// Parsing lives here rather than next to its first caller so the connector
// route and the "connect your Claude" page read the list the same way — the
// codebase already got bitten twice by one rule written out in two places.

export interface TokenEntry {
  token: string;
  email: string;
}

export function parseTokens(raw = process.env.MCP_TOKENS ?? ''): TokenEntry[] {
  const out: TokenEntry[] = [];
  for (const pair of raw.split(',')) {
    const i = pair.indexOf(':');
    if (i === -1) continue;
    const token = pair.slice(0, i).trim();
    const email = pair.slice(i + 1).trim();
    if (!token || !email) continue;
    // Split on the FIRST colon, so a token that itself contains one would turn
    // into a shorter, still-working key ("a:b:me@x" → token "a"). Anything whose
    // second half isn't a plain address is malformed: drop the whole entry
    // rather than quietly authenticating a prefix.
    if (email.includes(':')) continue;
    out.push({ token, email });
  }
  return out;
}

/** Who is calling, by their token. Null when the token is unknown. */
export function emailForToken(token: string | null): string | null {
  if (!token) return null;
  return parseTokens().find((e) => e.token === token)?.email ?? null;
}

/** A person's own token, so the connect page can show it to them. Matching is
    case-insensitive: Google addresses arrive lowercased, the env var is typed
    by hand. */
export function tokenForEmail(email: string | null): string | null {
  if (!email) return null;
  const wanted = email.trim().toLowerCase();
  return parseTokens().find((e) => e.email.toLowerCase() === wanted)?.token ?? null;
}
