import { describe, it, expect, vi, afterEach } from 'vitest';
import { numericHostToIpv4, isPrivateIp, hostLooksPrivate, safeFetch } from './safe-fetch';

describe('numericHostToIpv4 — obfuscated IPs decode to the real address', () => {
  it('decimal, hex, octal and short forms all mean 127.0.0.1', () => {
    expect(numericHostToIpv4('2130706433')).toBe('127.0.0.1'); // decimal
    expect(numericHostToIpv4('0x7f000001')).toBe('127.0.0.1'); // hex
    expect(numericHostToIpv4('0177.0.0.1')).toBe('127.0.0.1'); // octal first octet
    expect(numericHostToIpv4('127.1')).toBe('127.0.0.1'); // short form
  });
  it('a normal dotted quad is preserved; a name is not numeric', () => {
    expect(numericHostToIpv4('8.8.8.8')).toBe('8.8.8.8');
    expect(numericHostToIpv4('example.com')).toBeNull();
  });
});

describe('isPrivateIp', () => {
  it('flags loopback, link-local/metadata and RFC1918', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true); // cloud metadata
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true); // v4-mapped v6
  });
  it('lets a public address through', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('93.184.216.34')).toBe(false);
  });
});

describe('hostLooksPrivate (sync, no DNS)', () => {
  it('blocks local names and obfuscated IPs', () => {
    expect(hostLooksPrivate('localhost')).toBe(true);
    expect(hostLooksPrivate('foo.internal')).toBe(true);
    expect(hostLooksPrivate('2130706433')).toBe(true);
    expect(hostLooksPrivate('0x7f000001')).toBe(true);
    expect(hostLooksPrivate('[::1]')).toBe(true);
  });
  it('allows a public host', () => {
    expect(hostLooksPrivate('example.com')).toBe(false);
    expect(hostLooksPrivate('8.8.8.8')).toBe(false);
  });
});

describe('safeFetch — a redirect to a private address is refused mid-chain', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows a redirect but re-validates the hop, throwing on 127.0.0.1', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      // first hop is a public IP literal; it 302s to loopback
      return {
        status: 302,
        headers: new Headers({ location: 'http://127.0.0.1/admin' }),
      } as unknown as Response;
    }));
    // 203.0.113.10 (TEST-NET-3) is public by our ranges, so the first hop passes
    await expect(safeFetch('http://203.0.113.10/start')).rejects.toThrow(/blocked host/);
    expect(calls).toEqual(['http://203.0.113.10/start']); // never fetched the loopback URL
  });

  it('returns a normal 200 unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, headers: new Headers() } as unknown as Response)));
    const res = await safeFetch('http://93.184.216.34/');
    expect(res.status).toBe(200);
  });
});
