import dns from "node:dns/promises";
import net from "node:net";

/**
 * Outbound fetch for URLs a user supplies.
 *
 * Three things have to be true of every request this makes, and all three have
 * to hold on every redirect hop rather than only on the URL that was typed:
 *
 *  - the scheme is http or https,
 *  - the host does not resolve into this machine or a private network,
 *  - the response cannot grow without limit.
 *
 * Checking only the submitted URL is not enough. A perfectly ordinary external
 * address can answer with a 302 into the internal network, and the fetch would
 * follow it and hand back whatever it found.
 */

const MAX_REDIRECTS = Number(process.env.FETCH_MAX_REDIRECTS || 5);

/** Default 25 MB. Sources are documents; anything larger is not one. */
export const MAX_FETCH_BYTES = Number(process.env.MAX_FETCH_BYTES || 25 * 1024 * 1024);

/**
 * Self-hosted installs sometimes have a genuine internal wiki to index, so the
 * block can be lifted — but deliberately, by whoever runs the server, and never
 * by whoever is pasting in links.
 */
const ALLOW_PRIVATE = /^(1|true|yes)$/i.test(process.env.ALLOW_PRIVATE_NETWORK_FETCH ?? "");

function ipv4Blocked(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true;                        // "this network"
  if (a === 10) return true;                       // private
  if (a === 127) return true;                      // loopback
  if (a === 169 && b === 254) return true;         // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true;         // private
  if (a === 192 && b === 0) return true;           // protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                       // multicast, reserved, broadcast
  return false;
}

/**
 * Expand an IPv6 address into its eight 16-bit groups.
 *
 * Parsing by pattern is not enough here. `new URL()` rewrites an address into
 * its canonical form, so `::ffff:127.0.0.1` arrives as `::ffff:7f00:1` — the
 * same loopback address with no dots left to recognise it by.
 */
function expandIpv6(s: string): number[] | null {
  if (!s || /[^0-9a-f:.]/.test(s)) return null;
  const halves = s.split("::");
  if (halves.length > 2) return null;

  const convert = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!g) return null;
      if (g.includes(".")) {
        const q = g.split(".").map(Number);
        if (q.length !== 4 || q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
          return null;
        }
        out.push((q[0] << 8) | q[1], (q[2] << 8) | q[3]);
      } else {
        if (g.length > 4) return null;
        const n = parseInt(g, 16);
        if (Number.isNaN(n)) return null;
        out.push(n);
      }
    }
    return out;
  };

  const left = convert(halves[0]);
  const right = halves.length === 2 ? convert(halves[1]) : [];
  if (!left || !right) return null;

  if (halves.length === 1) return left.length === 8 ? left : null;
  const fill = 8 - left.length - right.length;
  if (fill < 1) return null;
  return [...left, ...Array<number>(fill).fill(0), ...right];
}

function ipv6Blocked(ip: string): boolean {
  const g = expandIpv6(ip.toLowerCase().split("%")[0]); // drop any zone index
  if (!g) return true; // unparseable is not something to connect to

  if (g.every((x) => x === 0)) return true;                       // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1

  // An IPv4 address carried inside IPv6 is still that IPv4 address.
  const zeros = g.slice(0, 5).every((x) => x === 0);
  const mapped = zeros && g[5] === 0xffff;                        // ::ffff:0:0/96
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if (mapped || nat64) {
    const v4 = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join(".");
    return ipv4Blocked(v4);
  }

  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  return false;
}

function addressBlocked(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return ipv4Blocked(ip);
  if (v === 6) return ipv6Blocked(ip);
  return true; // not an address we can reason about
}

export class BlockedHostError extends Error {}

/**
 * Reject a URL that points anywhere but the public internet.
 *
 * Every address the name resolves to is checked, not just the first: a name
 * that answers with one public and one private address would otherwise pass
 * and then be connected to on either.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedHostError("That does not look like a web address.");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new BlockedHostError(
      `Only http and https addresses can be fetched, not ${u.protocol.replace(":", "")}.`
    );
  }
  if (ALLOW_PRIVATE) return u;

  const host = u.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(host)) {
    if (addressBlocked(host)) {
      throw new BlockedHostError(
        `${host} is a private or local address, which cannot be fetched.`
      );
    }
    return u;
  }

  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new BlockedHostError(`${host} could not be resolved — the domain may not exist.`);
  }
  if (!addrs.length) {
    throw new BlockedHostError(`${host} could not be resolved — the domain may not exist.`);
  }
  for (const { address } of addrs) {
    if (addressBlocked(address)) {
      throw new BlockedHostError(
        `${host} resolves to ${address}, a private or local address, which cannot be fetched.`
      );
    }
  }
  return u;
}

export type SafeResponse = { res: Response; finalUrl: string };

/**
 * Fetch a user-supplied URL, validating every hop.
 *
 * Redirects are followed by hand rather than by the runtime, because the
 * runtime will not re-check where it is being sent.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {}
): Promise<SafeResponse> {
  let current = (await assertPublicUrl(url)).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, { ...init, redirect: "manual" });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        throw new BlockedHostError("That site redirected somewhere unreadable.");
      }
      // Discard the body of the hop we are leaving.
      await res.body?.cancel().catch(() => {});
      current = (await assertPublicUrl(next)).toString();
      continue;
    }

    return { res, finalUrl: current };
  }

  throw new BlockedHostError("That address redirected too many times.");
}

export class ResponseTooLargeError extends Error {}

/**
 * Read a response body with a ceiling.
 *
 * `arrayBuffer()` will hold whatever the other end decides to send, so a single
 * link to a large file is enough to exhaust memory.
 */
export async function readCapped(
  res: Response,
  maxBytes = MAX_FETCH_BYTES
): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") || 0);
  const limitMb = Math.round(maxBytes / 1024 / 1024);
  if (declared && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new ResponseTooLargeError(
      `That file is ${Math.round(declared / 1024 / 1024)} MB, over the ${limitMb} MB limit.`
    );
  }

  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ResponseTooLargeError(
        `That page is larger than the ${limitMb} MB limit.`
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
