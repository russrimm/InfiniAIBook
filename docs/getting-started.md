# Getting started

> Never set up a Node.js app or an `.env` file before? Start with
> [Install step by step](install-guide.md) instead.

**Prerequisites**

- **A model endpoint, set up first.** Reuse an existing Microsoft Foundry /
  Azure OpenAI resource or create a new one, or use a
  [named provider](configuration.md#named-providers) or any OpenAI-compatible
  server. Only a **chat** deployment is required; embeddings, Studio script,
  vision, transcription, image, realtime voice and Azure AI Speech are each
  optional and switch on their own features. The
  [install guide](install-guide.md#1-decide-what-you-need) walks through
  choosing and creating each one, with `az` commands;
  [Models and what they're used for](configuration.md#models-and-what-theyre-used-for)
  lists the settings. Copilot Studio agents are not model endpoints and can't
  be used here.
- **Node.js 22.13 or later**: the database uses the built-in `node:sqlite`.
- *Optional:* the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
  for Entra sign-in; Python 3 with `numpy`, `Pillow` and `imageio-ffmpeg` for
  whiteboard and motion videos; Gemini / YouTube / search API keys for the
  features described in the [docs](README.md). Everything optional degrades
  cleanly when unset.

```bash
npm install
cp .env.example .env.local   # then set your endpoint + deployment names
az login                     # Entra sign-in; see docs/configuration.md
npm run dev
```

Open <http://localhost:3000>, press **+ New notebook**, and follow the
getting-started steps in the chat panel: add sources, tick the ones to use, then
ask a question or create something in Studio. **? Help** in the header
explains the rest. For a production build, `npm run build` then
`npm start`. Both listen on `127.0.0.1` only, so other devices on your network
cannot reach the server. To open it to your network, set
`INFINIAIBOOK_PASSWORD` first, then use `npm run dev:lan` or `npm run start:lan`
(see [Reaching it from other devices](#reaching-it-from-other-devices)).

Upgrading from OpenNotebook? An existing `.data/opennotebook.db` is renamed to
`.data/infiniaibook.db` on first start; nothing else needs to change.

## Docker

```bash
cp .env.example .env.local     # set a provider; Entra `az login` is not available in the container
docker compose up -d --build
```

The image is a standalone Next.js server on Node 22. Data lives in the
`infiniaibook-data` volume (`/data`), and the port is published on
`127.0.0.1:3000` only. Local model servers on the host are reachable at
`http://host.docker.internal:<port>/v1`. Inside a container use API keys (or a
service principal via `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_CLIENT_SECRET`)
rather than `az login`. Whiteboard, motion and composed training videos need
Python; build with `docker compose build --build-arg WITH_PYTHON=true` (or
`docker build --build-arg WITH_PYTHON=true .`) to include it.

To run it in Azure instead, see [Running in Azure](azure-deployment.md).

## Password protection

Set `INFINIAIBOOK_PASSWORD` and every page and API route requires it. The
browser signs in at `/login` (a signed 30-day, HTTP-only cookie) and can sign
out from the home page. Scripts send `Authorization: Bearer <token>` with
`INFINIAIBOOK_API_TOKEN`; until that is set, the password works as the token.
It is a single shared password for a personal instance, not multi-user
accounts — see [SECURITY.md](../SECURITY.md).

## Reaching it from other devices

Without a password the server answers only to `localhost`, `127.0.0.1` and
`[::1]`. That stops a web page you visit from reaching it through DNS
rebinding. Requests for any other hostname get a 403. Separately, browsers
cannot send state-changing API requests (POST, PATCH, DELETE) from another site.
Scripts that send no `Origin` header are unaffected.

To use it from another device:

1. Set `INFINIAIBOOK_PASSWORD` (see above).
2. Start with `npm run dev:lan` or `npm run start:lan`, which listen on every
   interface.
3. If you reach it by name or IP and want that hostname checked too, list it
   in `ALLOWED_HOSTS`, e.g. `ALLOWED_HOSTS=notes.example.com,192.168.1.20`.
   When `ALLOWED_HOSTS` is set, it applies even with a password.

Behind a reverse proxy that rewrites `Host`, set `TRUST_PROXY=true` so the
forwarded host is accepted as the app's own origin.
