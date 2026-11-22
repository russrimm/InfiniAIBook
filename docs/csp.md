# Content Security Policy

The app sends two policies on every page: one that is **enforced**, and a
stricter one that is **report-only**. This page says what each does, what was
measured, and how to move to the strict policy once you have watched its
reports in your own deployment.

## What is enforced today

`next.config.ts` sends this on every response:

- `default-src 'self'`, no remote images, `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- `script-src 'self' 'unsafe-inline'`: inline scripts are allowed. Next.js
  needs some for its bootstrap, and the root layout adds the theme script.
- `connect-src` lists whole host families (`*.openai.azure.com`,
  `*.cognitiveservices.azure.com`, `*.tts.speech.microsoft.com`,
  `api.openai.com`), not only the resources you configured.

So the policy limits where a script can reach, but an injected inline script
would run. Markdown images in model output are shown as links, and links show
their real host, which is the main defense against injected content; the
strict policy below is defense in depth.

## The report-only strict policy

`src/proxy.ts` adds `Content-Security-Policy-Report-Only` to every page (not to
API responses). Because it is report-only, nothing is blocked; a browser
reports each thing it would have blocked to `/api/csp-report`, which writes one
line per report to the server log (`[csp] report-only: …`). The policy
(`src/lib/csp.ts`) is built for each request:

- `script-src 'nonce-<random per request>' 'sha256-<theme script>' 'strict-dynamic'`:
  no `'unsafe-inline'`. Next.js stamps the nonce on the scripts it renders; the
  theme script, which never changes, is allowed by its hash.
  `'unsafe-eval'` is added only in development.
- `connect-src 'self'` plus, when `AZURE_SPEECH_REGION` is set,
  `https://<region>.tts.speech.microsoft.com` and its `wss://` form: the only
  place the browser itself connects (the live avatar's Speech SDK). Every other
  model call goes through the app's own server. It is read from the environment
  at request time, so it follows the deployment's settings; `next.config.ts`
  headers are fixed at build time and could not.
- The rest matches the enforced policy, plus `worker-src 'self' blob:`.

The nonce makes every page render per request (`export const dynamic =
"force-dynamic"` in the root layout), so nothing is prerendered. Dynamic pages
are sent with `Cache-Control: no-store`, which a CDN or proxy must respect:
caching a page would hand its nonce to other visitors.

`POST /api/csp-report` reads at most 16 KB, logs at most 30 lines a minute, keeps
only the directive, the blocked address without its query, and the page, and
stores nothing.

## What was measured

The whole Playwright suite (147 tests: Studio, the training editor, the video
player, the live presenter with its mocked Speech SDK and WebRTC, html-to-image
exports, the theme no-flash script, the accessibility scans) was run against a
production build (`next build` and `next start`) with the report-only policy.
All 147 passed, and the one kind of report was:

```
[csp] report-only: script-src would block eval in …/_next/static/chunks/….js
```

That is Zod's test for whether `Function("")` is allowed, to choose between
compiled and interpreted validation. It falls back by itself, and the enforced
policy has always blocked it in production, so it changes nothing. It appears
once per page load. There were no reports for inline scripts, connections,
images, media, fonts, frames or workers.

## Why it is not enforced yet

- The live avatar and live discussion need real Azure Speech and Realtime
  connections, which the test suite fakes. The strict `connect-src` is derived
  from what the code does, but only reports from a real deployment show whether
  the Speech SDK also contacts another host (for example for speech
  recognition) in your region.
- Enforcing it on the Container App changes what every page can run, and a
  mistake would stop the app working until the next deployment, so it should
  follow a period of clean reports, not a single test run.
- `style-src 'unsafe-inline'` stays: React and html-to-image write style
  attributes. The gain here is for scripts.

## Moving to enforcement

1. Run with the report-only policy for a while (a week of normal use, including
   a live avatar and a live discussion) and read the log:
   `grep "\[csp\] report-only"` in the container logs. Ignore the Zod `eval` line.
2. Add any host a real report shows to `connectSources` in `src/lib/csp.ts`.
3. In `src/proxy.ts`, send the same value as `Content-Security-Policy` instead
   of `Content-Security-Policy-Report-Only` (both the response header and the
   request header Next.js reads the nonce from).
4. Remove `script-src` and `connect-src` from the policy in `next.config.ts`:
   when two policies are sent, a page must satisfy both, so the old
   `'unsafe-inline'` would not matter but its `connect-src` would still apply.
5. Run `npm run build` and `npx playwright test` against `next start`, as above,
   before deploying.

To go back, restore the header name in `src/proxy.ts`.
