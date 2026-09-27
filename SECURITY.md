# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately
through GitHub's [private vulnerability reporting](https://github.com/russrimm/opennotebook/security/advisories/new)
for this repository, with enough detail to reproduce it. You should get a reply
within a week.

## Deployment model

InfiniAIBook is a single-user, self-hosted application. Keep the following in
mind before running it anywhere other than your own machine:

- **Authentication is off by default.** Without `INFINIAIBOOK_PASSWORD`, anyone
  who can reach the server can read every notebook, add sources, and spend your
  model, Speech and search quota using the credentials the server runs with.
  So by default `npm run dev` and `npm start` listen on `127.0.0.1` only, and
  the middleware (`src/middleware.ts`, `src/lib/access.ts`) answers only to
  loopback hostnames plus any in `ALLOWED_HOSTS`. That blocks DNS rebinding,
  where a page you visit re-points its own domain at your machine. Browsers are
  also refused when they send a state-changing API request (POST, PATCH,
  DELETE) from another site (CSRF). `npm run dev:lan` / `npm run start:lan`
  listen on every interface; use them only with a password set.
  Setting the password puts every page and API route behind one shared password
  (`src/middleware.ts`). Browsers sign in at `/login` and get an HTTP-only
  cookie that holds a signed expiry (30 days), never the password. Scripts send
  `INFINIAIBOOK_API_TOKEN` as a bearer token. Until you set one, the password
  itself is accepted as the bearer token, with a warning in the server log.
  Changing the password or `INFINIAIBOOK_SESSION_SECRET` signs everyone out;
  **Sign out** on the home page clears this browser's cookie. Sign-in attempts
  are handled one at a time, and each failure holds the next attempt for
  longer (up to 30 s). Behind a TLS-terminating proxy, set `TRUST_PROXY=true`
  so the cookie gets the `Secure` flag. It is not multi-user access control,
  so keep the default localhost binding where you can, and use HTTPS or an
  authenticating reverse proxy when it is reachable by others.
- **The server fetches URLs on your behalf.** Links, feeds, discovery results
  and the built-in browser are fetched server-side. Addresses that resolve to
  loopback, private, link-local or cloud-metadata ranges are refused on every
  redirect hop (`src/lib/safefetch.ts`, tested by `npm run check:ssrf`).
  `ALLOW_PRIVATE_NETWORK_FETCH=true` turns that protection off; only set it if
  you trust everyone who can add a source.
- **Source text can try to steer the model.** Web pages, feeds and documents
  go into the prompt verbatim, and an injected instruction could make an answer
  embed a URL carrying private text. Markdown images in model output (chat,
  studio artifacts, AI notes, search answers) are therefore shown as a link
  rather than loaded (`src/components/Markdown.tsx`), and links show their real
  host. Only notes you write yourself render images. Every response also sends
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: no-referrer`, and a Content Security Policy that allows no
  remote images or connections (`next.config.ts`). The CSP is Report-Only for
  now, so a violation is logged in the browser console rather than blocked.
  Once it is enforced, remote images in your own notes will stop loading too.
- **Secrets stay in `.env.local`.** It is git-ignored. Prefer Microsoft Entra ID
  (`az login` or a managed identity) over API keys for Azure services.
- **Data is stored unencrypted** under `DATA_DIR` (default `./.data`): sources,
  embeddings, chat history and generated media. Protect that directory as you
  would the documents themselves.
- **`YOUTUBE_COOKIE` is a live session credential** for a Google account. Use a
  throwaway account if you set it at all.
