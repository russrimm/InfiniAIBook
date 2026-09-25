# Getting started

**Prerequisites**

- **Node.js 22.13 or later** — the database uses the built-in `node:sqlite`.
- **A model provider** — a key for one of the [named providers](configuration.md#named-providers),
  an Azure OpenAI resource with a chat and an embedding deployment, or any
  OpenAI-compatible server (see [Configuration](configuration.md)).
- *Optional:* the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
  for Entra sign-in; an Azure Speech resource for audio overviews and videos;
  Python 3 for whiteboard videos; Gemini / YouTube / search API keys for the
  features described in the [docs](README.md). Everything optional degrades cleanly when unset.

```bash
npm install
cp .env.example .env.local   # then set your endpoint + deployment names
az login                     # Entra sign-in; see docs/configuration.md
npm run dev
```

Open <http://localhost:3000>. For a production build, `npm run build` then
`npm start`. Add `-- -H 127.0.0.1` to either command to keep the server off
your network.

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
rather than `az login`. Whiteboard videos need Python; uncomment the marked
lines in the [`Dockerfile`](../Dockerfile) to include it.

## Password protection

Set `INFINIAIBOOK_PASSWORD` and every page and API route requires it. The
browser signs in at `/login` (a 30-day, HTTP-only cookie); scripts send
`Authorization: Bearer <password>`. It is a single shared password for a
personal instance, not multi-user accounts — see [SECURITY.md](../SECURITY.md).
