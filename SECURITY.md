# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately
through GitHub's [private vulnerability reporting](https://github.com/russrimm/InfiniAIBook/security/advisories/new)
for this repository, with enough detail to reproduce it. You should get a reply
within a week.

## Deployment model

InfiniAIBook is a single-user, self-hosted application. Keep the following in
mind before running it anywhere other than your own machine:

- **Authentication is off by default.** Without `INFINIAIBOOK_PASSWORD`, anyone
  who can reach the server can read every notebook, add sources, and spend your
  model, Speech and search quota using the credentials the server runs with.
  So by default `npm run dev` and `npm start` listen on `127.0.0.1` only, and
  the proxy (`src/proxy.ts`, `src/lib/access.ts`) answers only to
  loopback hostnames plus any in `ALLOWED_HOSTS`. That blocks DNS rebinding,
  where a page you visit re-points its own domain at your machine. Browsers are
  also refused when they send a state-changing API request (POST, PATCH,
  DELETE) from another site (CSRF), and when they read an API route that
  another site started (for example through an audio or image element), since
  some reads spend Speech quota or make the server fetch a URL. Only a clicked
  top-level link is let through. `npm run dev:lan` / `npm run start:lan`
  listen on every interface; use them only with a password set.
  Setting the password puts every page and API route behind one shared password
  (`src/proxy.ts`). Browsers sign in at `/login` and get an HTTP-only
  cookie that holds a signed expiry (30 days), never the password. The signing
  key is stretched from the password and `INFINIAIBOOK_SESSION_SECRET` with
  PBKDF2 (210,000 rounds), so a captured cookie cannot be used to test password
  guesses at hash speed; set a long random `INFINIAIBOOK_SESSION_SECRET` anyway
  (the Azure template does). Signing out is per browser: a cookie cannot be
  revoked before it expires except by changing the password or the secret.
  Scripts send
  `INFINIAIBOOK_API_TOKEN` as a bearer token. The password is not accepted as a
  bearer token unless `INFINIAIBOOK_ALLOW_PASSWORD_BEARER=true`.
  Changing the password or `INFINIAIBOOK_SESSION_SECRET` signs everyone out;
  **Sign out** on the home page clears this browser's cookie. Sign-in attempts
  from one client are handled one at a time, and each failure holds that
  client's next attempt for longer (up to 30 s). Wrong bearer tokens go through
  the same back-off, shared with sign-in, so the API cannot be used to guess the
  password at full speed; a valid session cookie is checked first and never
  waits behind them. Behind a reverse proxy with `TRUST_PROXY=true`, clients are
  told apart by the last `X-Forwarded-For` entry (the one your proxy added), so
  someone guessing from one address does not lock the owner out of signing in.
  Without a trusted proxy the server cannot tell clients apart and they share
  one queue. When too many failed attempts are already waiting, further ones get
  an immediate 429. The back-off is in memory and per process, and it does not
  replace a strong password.
  After sign-in, the `?next=` path is resolved against this origin and dropped
  unless it stays here, so `/login` cannot be used as an open redirect
  (backslash and control-character tricks included). Behind a TLS-terminating
  proxy, set `TRUST_PROXY=true`
  so the cookie gets the `Secure` flag. It is not multi-user access control,
  so keep the default localhost binding where you can, and use HTTPS or an
  authenticating reverse proxy when it is reachable by others.
  The one unauthenticated exception is `GET`/`HEAD /api/health`, which skips the
  host and password checks so container probes and the deploy smoke test work. It
  returns only `ok` or `unavailable`, with no version, path or error text.
- **The server fetches URLs on your behalf.** Links, feeds, discovery results
  and the built-in browser are fetched server-side. Addresses that resolve to
  loopback, private, link-local or cloud-metadata ranges are refused on every
  redirect hop (`src/lib/safefetch.ts`, tested by `npm run check:ssrf` and
  `tests/safefetch-*.test.ts`). Addresses with a username or password in them
  are refused. The
  check runs inside the connection's own DNS lookup, so the address connected
  to is the address that was checked: a domain that answers with a public
  address first and `127.0.0.1` a moment later (DNS rebinding) is still refused.
  YouTube caption requests, which carry `YOUTUBE_COOKIE` when it is set, only
  ever go to `youtube.com`.
  `ALLOW_PRIVATE_NETWORK_FETCH=true` turns that protection off; only set it if
  you trust everyone who can add a source. A response is also stopped when it
  grows past `MAX_FETCH_BYTES` or takes longer than `DOWNLOAD_TIMEOUT_MS` (two
  minutes) to arrive, so a site that trickles bytes cannot hold a request open.
- **Request bodies are size-checked before they are buffered.** Next.js holds a
  whole request body in memory before a route sees it (up to about 200 MB), so
  every API request is refused with 413 when its `Content-Length` is over its
  endpoint's limit, before anything is read: 8 MB for ordinary JSON,
  about 24 MB for the endpoints that take an image as a data URL, and the
  upload limits (`MAX_UPLOAD_BYTES` for sources, 50 MB for music, 100 MB for an
  intro or outro clip, 200 MB for a notebook export or backup) for the file
  endpoints. Those endpoints also count the bytes that really arrive and stop
  at the limit, so a chunked upload, or one whose `Content-Length` is wrong,
  cannot get past it. An ordinary endpoint that receives a chunked body with no
  `Content-Length` answers 411, because its size cannot be checked; browsers
  and every common reverse proxy send the length. A proxy that streams request
  bodies without one (for example nginx with `proxy_request_buffering off`)
  must buffer them for the API paths. See `src/lib/bodylimits.ts` and
  `src/proxy.ts`.
- **Uploaded archives are checked as they inflate.** ZIP, DOCX, PPTX, EPUB and
  notebook-export files can be tiny and still expand to gigabytes (a "zip
  bomb"). The number of entries is counted from the real directory before any
  is opened, and every part is inflated under a size cap and a running total
  (`MAX_UPLOAD_BYTES`, `MAX_ARCHIVE_EXPANDED_BYTES`) that stops reading the
  moment it is passed (`src/lib/zipread.ts`, `src/lib/officeguard.ts`). A file
  over a cap is refused with a message naming the limit.
- **Source text can try to steer the model.** Web pages, feeds and documents
  go into the prompt verbatim, and an injected instruction could make an answer
  embed a URL carrying private text. Markdown images in model output (chat,
  studio artifacts, AI notes, search answers) are therefore shown as a link
  rather than loaded (`src/components/Markdown.tsx`), and links show their real
  host. Only notes you write yourself render images. Every response also sends
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, a `Permissions-Policy` that turns off the
  camera, location, payment and USB (the microphone and screen capture stay
  available to this app only, for live discussion and Screen helper) and an
  enforced Content Security Policy that allows no remote images
  (`next.config.ts`). Behind a TLS-terminating proxy that sends
  `X-Forwarded-Proto: https`, responses also carry `Strict-Transport-Security`
  (one year, no subdomains); plain-HTTP localhost never does. The CSP still
  allows inline scripts (`'unsafe-inline'`, Next's bootstrap) and connections to
  the Azure OpenAI, Speech and OpenAI host families, not only your own
  resource, so it limits where a script can reach rather than which Azure
  tenant. Remote images in your own notes do not load, and a note's
  image may only be one this app serves (`/api/image/<id>`), so an imported
  note cannot point an image at an API route. Live
  discussions may connect to Azure OpenAI or OpenAI realtime hosts (the CSP
  allows the whole `*.openai.azure.com` and `api.openai.com` families); other
  remote connections are refused. The in-app browser does not frame
  this app's own origin or a loopback address.
- **Secrets stay in `.env.local`.** It is git-ignored. Prefer Microsoft Entra ID
  (`az login` or a managed identity) over API keys for Azure services.
- **Model spend has a daily ceiling.** When a cloud provider is configured and
  `DAILY_BUDGET_USD` is unset, estimated chat, image, speech, discussion, video
  and image-description calls stop at $25 per UTC day. The ceiling uses rough
  price estimates, not your provider's bill. Set `DAILY_BUDGET_USD=0` to turn
  it off (only an explicit 0 does; a value that is not a number uses the
  default), or another number to change it. Local model endpoints are
  unlimited unless you set a ceiling.
- **Data is stored unencrypted** under `DATA_DIR` (`./.data` when you run it
  yourself, `/data` in the Docker image and the Azure deployment): sources,
  embeddings, chat history and generated media. Protect that directory as you
  would the documents themselves. Export a notebook from its header, or use
  **Backup** on the home page, if you want a copy outside it. On the Azure
  deployment the data lives on a private NFS file share: encrypted at rest, not
  encrypted in transit (NFS has none), and reachable only through a private
  endpoint inside the app's virtual network.
- **`YOUTUBE_COOKIE` is a live session credential** for a Google account. Use a
  throwaway account if you set it at all.
- **Builds and releases are pinned.** Every GitHub Action is pinned to a full
  commit SHA and the Docker base image to a digest; Dependabot's
  `github-actions` and `docker` updates propose newer ones as pull requests, so
  review those like any dependency change. Some npm majors are held back on
  purpose and explained in `.github/dependabot.yml`: undici 8 and unpdf 2 (need
  Node 22.19 and 24, the app supports 22.13), eslint 10 and TypeScript 7 (not
  yet supported by `eslint-config-next`'s plugins and typescript-eslint) and
  `@types/node` above 22. CI jobs do not keep the checkout
  token and have time limits, and only the deploy job may request an Azure
  sign-in token (OIDC). That job runs in the `production` environment, which
  should keep a required reviewer and be limited to the `main` branch in the
  repository's environment settings. `docker-compose.yml` drops all Linux
  capabilities and sets `no-new-privileges` for the container.

## Deploying beyond your own machine

- **Always set `INFINIAIBOOK_PASSWORD`** (and a long random
  `INFINIAIBOOK_SESSION_SECRET`) before the server is reachable by anyone else.
  The Docker image listens on every interface inside the container; the
  compose file publishes it on `127.0.0.1` only. Publish it further only behind
  HTTPS.
- **`ALLOWED_HOSTS=*` accepts any `Host` header.** With a password set that is
  fine, because the password is what protects the app. Without one it removes
  the DNS-rebinding protection, so list real hostnames instead.
- **`TRUST_PROXY=true` makes the app believe the proxy's headers**
  (`X-Forwarded-Host`, `X-Forwarded-Proto`, the last `X-Forwarded-For` entry).
  Set it only when a proxy you control sits in front and overwrites or appends
  those headers, never when clients can reach the app directly: they could then
  choose their own host, protocol and address.
- **What watches this repository:** CodeQL on every pull request, Dependabot
  version and security updates, GitHub secret scanning with push protection,
  and a CI check that the lockfile resolves only from the public npm registry.
  Report anything they miss through the private reporting link above.
