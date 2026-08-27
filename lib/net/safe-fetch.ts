// SSRF-safe fetch. Our server fetches URLs that a logged-in user supplied (a
// research row's "source"), so a hostile source must not be able to reach the
// private network or the cloud metadata endpoint (169.254.169.254).
//
// Three ways that guard is normally bypassed, all closed here:
//   1. Redirects — a public URL that 302s to http://169.254.169.254/. We follow
//      redirects MANUALLY and re-validate every hop, instead of redirect:'follow'.
//   2. Numeric/obfuscated IPs — http://2130706433/, http://0x7f000001/, octal
//      0177.0.0.1 all mean 127.0.0.1 but slip past a dotted-quad regex. We parse
//      them the way the C resolver (inet_aton) does and check the real integer.
//   3. Hostnames that RESOLVE to a private address — we DNS-resolve the host and
//      reject if any returned address is private.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// [startInclusive, endInclusive] as unsigned 32-bit integers.
const PRIVATE_V4_RANGES: Array<[number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8      "this network"
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x64400000, 0x647fffff], // 100.64.0.0/10  CGNAT
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8    loopback
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 link-local (incl. metadata .169.254)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15  benchmarking
  [0xe0000000, 0xffffffff], // 224.0.0.0/3    multicast + reserved
];

function v4ToLong(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const b = Number(part);
    if (b > 255) return null;
    n = n * 256 + b;
  }
  return n >>> 0;
}

// inet_aton: decimal / hex / octal parts, and the short forms (1, 2 or 3 dots)
// where the final part fills the remaining low bytes. Returns a dotted quad.
export function numericHostToIpv4(host: string): string | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8);
    else if (/^(0|[1-9][0-9]*)$/.test(part)) n = parseInt(part, 10);
    else return null;
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  let value: number;
  const n = nums.length;
  if (n === 1) value = nums[0];
  else if (n === 2) { if (nums[0] > 0xff || nums[1] > 0xffffff) return null; value = nums[0] * 0x1000000 + nums[1]; }
  else if (n === 3) { if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null; value = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2]; }
  else { if (nums.some((x) => x > 0xff)) return null; value = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2] * 0x100 + nums[3]; }
  if (value > 0xffffffff) return null;
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToLong(ip);
    if (n === null) return true; // unparseable → treat as unsafe
    return PRIVATE_V4_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
  }
  if (kind === 6) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true; // loopback / unspecified
    if (low.startsWith('fc') || low.startsWith('fd')) return true; // fc00::/7 ULA
    if (low.startsWith('fe8') || low.startsWith('fe9') || low.startsWith('fea') || low.startsWith('feb')) return true; // fe80::/10 link-local
    const mapped = low.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/); // IPv4-mapped
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // not a valid IP literal
}

const LOCAL_NAME = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;

/** Sync check with no DNS: literal/numeric IPs and obvious local names. */
export function hostLooksPrivate(hostname: string): boolean {
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (!host) return true;
  if (isIP(host)) return isPrivateIp(host);
  const numeric = numericHostToIpv4(host);
  if (numeric) return isPrivateIp(numeric);
  return LOCAL_NAME.test(host);
}

/** Full check incl. DNS resolution. Throws if the URL isn't safe to fetch. */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error('bad url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad scheme');

  const host = u.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (hostLooksPrivate(host)) throw new Error('blocked host');

  // a plain IP was already checked by hostLooksPrivate; a name still needs DNS
  if (!isIP(host) && !numericHostToIpv4(host)) {
    let addrs: Array<{ address: string }>;
    try { addrs = await lookup(host, { all: true }); } catch { throw new Error('dns failed'); }
    for (const a of addrs) if (isPrivateIp(a.address)) throw new Error('resolves to private');
  }
  return u;
}

export interface SafeFetchOpts {
  maxRedirects?: number;
}

/**
 * fetch that validates the URL (and every redirect hop) against the private-
 * network guard before each request. Redirects are followed manually so a public
 * URL cannot bounce us to an internal one. `init.signal` is honoured for timeouts.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  { maxRedirects = 5 }: SafeFetchOpts = {},
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res; // a 3xx with no Location — nothing to follow
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error('too many redirects');
}
