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
  Setting it puts every page and API route behind one shared password
  (`src/middleware.ts`): browsers sign in at `/login` and get an HTTP-only
  cookie holding an HMAC of the password, and scripts send
  `Authorization: Bearer <password>`. Changing the password signs everyone out.
  It is not multi-user access control and has no rate limiting beyond a short
  delay on failures, so still bind to localhost
  (`npm run dev -- -H 127.0.0.1`, `npm start -- -H 127.0.0.1`), use HTTPS, or
  put it behind an authenticating reverse proxy when it is reachable by others.
- **The server fetches URLs on your behalf.** Links, feeds, discovery results
  and the built-in browser are fetched server-side. Addresses that resolve to
  loopback, private, link-local or cloud-metadata ranges are refused on every
  redirect hop (`src/lib/safefetch.ts`, tested by `npm run check:ssrf`).
  `ALLOW_PRIVATE_NETWORK_FETCH=true` turns that protection off; only set it if
  you trust everyone who can add a source.
- **Secrets stay in `.env.local`.** It is git-ignored. Prefer Microsoft Entra ID
  (`az login` or a managed identity) over API keys for Azure services.
- **Data is stored unencrypted** under `DATA_DIR` (default `./.data`): sources,
  embeddings, chat history and generated media. Protect that directory as you
  would the documents themselves.
- **`YOUTUBE_COOKIE` is a live session credential** for a Google account. Use a
  throwaway account if you set it at all.
