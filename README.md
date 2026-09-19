# OpenNotebook

A self-hosted NotebookLM-style research studio. Upload your own sources, chat with
them, and turn them into **reports, briefings, infographics, mind maps, quizzes,
study guides, FAQs and timelines** — every claim cited back to the document it came from.

Built with Next.js 15, TypeScript, SQLite and Azure OpenAI.

---

## What it does

| | |
|---|---|
| **Sources** | Upload PDF, DOCX, TXT, MD, CSV, JSON or HTML; paste raw text; or add a URL — including **YouTube links**, which are ingested as transcripts. Each source is chunked, embedded and summarised. |
| **Grounded chat** | Streaming answers built only from the sources you have selected, with hoverable inline citations `[1]` that show the exact excerpt used. |
| **Studio** | Nine generators, each returning a structured, validated artifact rendered with a purpose-built view — not a wall of text. |
| **Everything is local** | Sources, chunks, embeddings, chat history, artifacts and generated audio live under `.data/`. |

### Studio formats

| Format | Output |
|---|---|
| 🎧 Audio overview | Two hosts discuss your sources — real MP3 audio with a synced, clickable transcript |
| 📄 Report | Executive summary, analytical sections, key takeaways, open questions |
| 🧾 Briefing doc | Under 700 words: bottom line, evidence, risks, next steps |
| 📊 Infographic | Headline stats, themed sections, key takeaway — rendered as a real visual layout |
| 🕸️ Mind map | Interactive zoomable SVG concept tree |
| 🧠 Quiz | 10 multiple-choice questions, interactive, scored, with explanations |
| 🎓 Study guide | Core concepts, glossary table, short-answer questions + answer key |
| ❓ FAQ | Collapsible Q&A the sources actually answer |
| 🗓️ Timeline | Chronology extracted from the material |

Every artifact can be copied or exported to Markdown; audio can be downloaded as MP3.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then set your endpoint + deployment names
az login                     # Entra sign-in; see Authentication below
npm run dev
```

Open <http://localhost:3000>.

### Configuration

`.env.local`:

```ini
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_DEPLOYMENT=gpt-5                             # chat deployment name
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large  # embedding deployment name
# DATA_DIR=./.data                                        # optional
```

Both deployment values are **deployment names** from Azure AI Foundry, not model names.
List what your resource actually has:

```bash
az cognitiveservices account deployment list -n <resource> -g <rg> -o table
```

> `AZURE_OPENAI_API_VERSION` is a dated **API** release such as `2024-10-21`.
> It is not a model version — setting it to something like gpt-5's `2025-08-07`
> makes every call return a confusing 404. The app detects this and says so.

### Reasoning models (gpt-5, o-series)

These deployments reject a custom `temperature` and accept only the default.
Because a deployment name is user-chosen, the model family can't be inferred from
it, so the client probes once, caches the result for the process, and transparently
retries without `temperature`. No configuration needed — gpt-4o and gpt-5 both work.

### Authentication (Microsoft Entra ID)

There is no API key. The app authenticates with `DefaultAzureCredential` and
requests tokens for `https://cognitiveservices.azure.com/.default`.

**Locally** — sign in once, then start the app:

```bash
az login
npm run dev
```

Your account needs the **Cognitive Services OpenAI User** role on the Azure
OpenAI resource:

```bash
az role assignment create \
  --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Cognitive Services OpenAI User" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<resource>"
```

**On Azure** (App Service, Container Apps, AKS, VM) — enable a managed identity
and grant it the same role. Nothing else to configure. For a *user-assigned*
identity, set `AZURE_CLIENT_ID` to its client id.

**CI / off-Azure containers** — supply a service principal via
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`.

Token acquisition, caching and refresh are handled per request, so long-running
servers never serve an expired token. Auth failures are translated into
actionable messages in the UI (missing credential vs. missing role assignment)
rather than a bare 401.

> A legacy `AZURE_OPENAI_API_KEY` is still honoured if present, and takes
> precedence over Entra. Leave it unset to use Entra.

Without any working credential the app still runs: sources ingest and are
searchable by keyword, but chat and studio generation return a clear error.

### Rate limits and deployment quota

A deployment's tokens-per-minute quota caps how much context one request may
carry, and studio generation is context-hungry. Two mechanisms keep it working
on small deployments:

1. **Retry with backoff** — 429 and 5xx responses are retried up to five times,
   honouring `Retry-After` when Azure supplies it.
2. **Adaptive context** — if rate limiting persists, generation halves its
   excerpt budget and retries, down to a floor, rather than failing.

`STUDIO_CONTEXT_CHARS` (default `30000`, roughly 7.5K prompt tokens) sets the
starting budget. Raise it on a large deployment for richer artifacts; lower it
if you see repeated throttling. Check what your deployment allows with:

```bash
az cognitiveservices account deployment list -n <resource> -g <rg> \
  --query "[].{name:name, capacity:sku.capacity}" -o table
```

---

## Audio overviews

The 🎧 button writes a two-host dialogue grounded in your sources, then narrates
it with Azure Speech and stores an MP3 under `.data/audio/`.

It uses `en-Multitalker:DragonHDLatestNeural`, Azure's multi-speaker voice, so a
whole exchange renders in one request and the hosts actually sound like they are
talking to each other. Turns are synthesised in small batches — a single large
request has its connection dropped by the service — and the resulting MP3s are
concatenated. Because the output is constant-bitrate, batch durations are exact,
which is what drives the synced transcript.

Setup:

```ini
AZURE_SPEECH_REGION=eastus2
AZURE_SPEECH_RESOURCE_ID=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<name>
```

The identity needs the **Cognitive Services Speech User** role. An
`AZURE_SPEECH_KEY` works instead if you prefer key auth. Without either, the rest
of the app is unaffected — only the audio button reports that it is unconfigured.

The script prompt forbids markdown, citation markers and symbols that a voice
would mangle, and the server strips any that slip through, so nothing reads
"bracket two" aloud.

## YouTube sources

Paste a YouTube URL into **Link** and the transcript is ingested as a source.
`watch?v=`, `youtu.be`, `/shorts/` and `/embed/` forms are all recognised.

> **YouTube actively blocks this.** Its caption endpoint is gated behind a
> proof-of-origin token; without one it answers `200` with an empty body rather
> than an error. On many networks — including most corporate and datacenter
> ranges — transcript fetching will therefore fail no matter how the request is
> shaped. The app detects this precisely and says so, instead of reporting
> "no captions available".
>
> If you hit it, either set `YOUTUBE_COOKIE` to the `Cookie` header from a
> signed-in youtube.com session, or use **Paste** to add the transcript as a
> text source. Video titles and authors still resolve either way.

---

## How grounding works

1. **Ingest** — text is extracted (`unpdf` for PDF, `mammoth` for DOCX, `cheerio`
   for HTML), normalised, and split into ~1400-character chunks with 200 characters
   of overlap on paragraph boundaries.
2. **Embed** — each chunk is embedded and stored as a `Float32Array` blob in SQLite.
3. **Retrieve** — queries are embedded and ranked by cosine similarity, blended
   with a lexical overlap score (85/15) so rare proper nouns are not lost. If the
   embedding call fails, retrieval degrades gracefully to keyword-only.
4. **Generate** — chat uses the top-k passages; studio generation uses an evenly
   spread sample across *every* selected source, so a report is not written from
   page one alone.
5. **Cite** — passages are numbered in the prompt, the model emits `[n]` markers,
   and the UI resolves them back to source title, part number and the raw excerpt.

Studio outputs are requested as JSON, then parsed defensively and normalised
(clamped answer indices, depth-limited mind-map trees, validated stat blocks) so a
malformed model response can never break the UI.

---

## Architecture

```
src/
  app/
    page.tsx                       notebook list
    notebook/[id]/page.tsx         workspace shell
    api/
      notebooks/                   CRUD + detail (sources, artifacts, messages)
      notebooks/[id]/sources/      ingestion (files | url | youtube | text)
      sources/[id]/                read full text, delete
      chat/                        NDJSON streaming, grounded answers
      generate/                    studio artifact generation
      podcast/                     dialogue script + speech synthesis
      audio/[id]/                  MP3 streaming with byte-range support
      artifacts/[id]/              delete
  components/
    Workspace  SourcesPanel  ChatPanel  StudioPanel
    ArtifactModal  SourceModal  MindMap  Quiz  Infographic
    PodcastPlayer  Markdown
  lib/
    db.ts        SQLite schema (node:sqlite, no native build step)
    ai.ts        Azure OpenAI client (Entra ID auth), chat / JSON / embeddings
    speech.ts    Azure Speech dialogue synthesis
    youtube.ts   transcript retrieval and URL parsing
    ingest.ts    text extraction + chunking
    retrieve.ts  hybrid retrieval, corpus sampling, citation building
    studio.ts    per-format prompts and schemas
    paths.ts     data/audio locations, traversal-safe id resolution
```

**Storage note:** the database uses Node 22+'s built-in `node:sqlite`, so there is
no native compilation step. The handle is opened lazily on first query.

---

## Roadmap ideas

- Voice and length controls for audio overviews
- Per-source notes and multiple saved chat threads
- Postgres + pgvector adapter for multi-user deployments
- Auth and sharing

## Licence

MIT
