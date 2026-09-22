/**
 * Checks the guard on outbound fetches of user-supplied URLs.
 *
 * Run with: npm run check:ssrf
 *
 * The cases here are the ones that actually got through at some point. The
 * IPv4-mapped IPv6 entries in particular: `new URL()` rewrites
 * `::ffff:127.0.0.1` to `::ffff:7f00:1`, so a check that looks for a dotted
 * quad sees nothing to object to and lets loopback through.
 */
import http from "node:http";
import {
  assertPublicUrl,
  BlockedHostError,
  readCapped,
  ResponseTooLargeError,
  safeFetch,
} from "../src/lib/safefetch";

const MB = 1024 * 1024;
let failures = 0;

function report(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(40)} ${detail}`);
}

const MUST_BLOCK = [
  "http://127.0.0.1/",
  "http://127.1/",
  "http://0.0.0.0/",
  "http://10.1.2.3/",
  "http://172.16.0.1/",
  "http://172.31.255.255/",
  "http://192.168.1.1/",
  "http://169.254.169.254/",
  "http://100.64.0.1/",
  "http://198.18.0.1/",
  "http://224.0.0.1/",
  "http://255.255.255.255/",
  "http://[::1]/",
  "http://[::]/",
  "http://[::ffff:127.0.0.1]/",
  "http://[::ffff:169.254.169.254]/",
  "http://[::ffff:10.0.0.1]/",
  "http://[64:ff9b::127.0.0.1]/",
  "http://[fc00::1]/",
  "http://[fd12:3456::1]/",
  "http://[fe80::1]/",
  "http://localhost/",
  "file:///etc/passwd",
  "gopher://127.0.0.1/",
  "ftp://example.com/",
  "http://2130706433/",
  "http://0x7f.0x0.0x0.0x1/",
  "http://017700000001/",
];

const MUST_ALLOW = ["https://example.com/", "http://93.184.215.14/"];

async function addresses() {
  console.log("addresses");
  for (const u of MUST_BLOCK) {
    try {
      await assertPublicUrl(u);
      report(false, u, "was allowed");
    } catch (e) {
      report(e instanceof BlockedHostError, u, (e as Error).message.slice(0, 48));
    }
  }
  for (const u of MUST_ALLOW) {
    try {
      await assertPublicUrl(u);
      report(true, u, "allowed");
    } catch (e) {
      report(false, u, `wrongly blocked: ${(e as Error).message}`);
    }
  }
}

async function redirects() {
  console.log("\nredirects");
  const inward = http.createServer((_q, r) => {
    r.writeHead(302, { location: "http://127.0.0.1:9878/" });
    r.end();
  });
  await new Promise<void>((r) => inward.listen(9877, "127.0.0.1", () => r()));
  try {
    await safeFetch("http://127.0.0.1:9877/");
    report(false, "302 into a private address", "was followed");
  } catch (e) {
    report(e instanceof BlockedHostError, "302 into a private address", "refused");
  } finally {
    inward.close();
  }
}

async function sizeCap() {
  console.log("\nsize cap");
  const server = http.createServer((q, r) => {
    const p = new URL(q.url ?? "/", "http://x").searchParams;
    const mb = Number(p.get("mb") ?? 1);
    const head: Record<string, string> = { "content-type": "text/plain" };
    if (p.get("declare") !== "0") head["content-length"] = String(mb * MB);
    r.writeHead(200, head);
    for (let i = 0; i < mb; i++) r.write(Buffer.alloc(MB, "a"));
    r.end();
  });
  await new Promise<void>((r) => server.listen(9890, "127.0.0.1", () => r()));

  const cases: [string, string, number, boolean][] = [
    ["2MB under a 25MB cap", "mb=2", 25 * MB, false],
    ["60MB, length declared", "mb=60", 25 * MB, true],
    ["60MB, length hidden", "mb=60&declare=0", 25 * MB, true],
    ["exactly at the cap", "mb=4", 4 * MB, false],
  ];
  for (const [label, query, cap, shouldFail] of cases) {
    const res = await fetch(`http://127.0.0.1:9890/?${query}`);
    try {
      const buf = await readCapped(res, cap);
      report(!shouldFail, label, `read ${(buf.length / MB).toFixed(1)}MB`);
    } catch (e) {
      report(shouldFail && e instanceof ResponseTooLargeError, label, (e as Error).message);
    }
  }
  server.close();
}

async function main() {
  await addresses();
  await redirects();
  await sizeCap();

  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
