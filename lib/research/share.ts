// Public read-only share links for a base — "anyone with the link", no login.
//
// The token is an HMAC of the base id under a server secret, so it needs no DB
// column (we can't run DDL) and can't be guessed without the secret. A base is
// exposed only when its owner reveals the link; the public routes serve that one
// base, read-only, and nothing else.
//
// Off by default: with no RESEARCH_SHARE_SECRET set, sharing is disabled and the
// public routes 404. v1 limitation: there's no per-base revoke — rotating the
// secret invalidates every link at once.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function sharingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.RESEARCH_SHARE_SECRET;
}

/** Unguessable token for a base id, or '' when sharing is off. */
export function shareToken(baseId: string, env: Record<string, string | undefined> = process.env): string {
  const secret = env.RESEARCH_SHARE_SECRET;
  if (!secret || !baseId) return '';
  return createHmac('sha256', secret).update(baseId).digest('base64url').slice(0, 24);
}

/** Constant-time check that a token matches the base id under the current secret. */
export function verifyShareToken(
  baseId: string,
  token: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const expected = shareToken(baseId, env);
  if (!expected || !token || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
