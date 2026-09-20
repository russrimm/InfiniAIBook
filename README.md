# OpenNotebook

A self-hosted NotebookLM-style research studio. Upload your own sources, chat with
them, and turn them into **reports, briefings, infographics, mind maps, quizzes,
study guides, FAQs and timelines** — every claim cited back to the document it came from.

Built with Next.js 15, TypeScript, SQLite and Azure OpenAI.

---

## What it does

| | |
|---|---|
| **Sources** | Upload PDF, DOCX, TXT, MD, CSV, JSON or HTML; paste raw text; add a URL — including **YouTube links**; or **discover sources** by describing a topic and picking from web results. Ingestion runs in the background, so you can keep adding while earlier items process. |
| **Grounded chat** | Streaming answers built only from the sources you have selected, with hoverable inline citations `[1]` that show the exact excerpt used. |
| **Studio** | Nine generators, each returning a structured, validated artifact rendered with a purpose-built view — not a wall of text. |
| **Everything is local** | Sources, chunks, embeddings, chat history, artifacts and generated audio live under `.data/`. |

### Studio formats

| Format | Output |
|---|---|
| 🎧 Audio overview | Two hosts discuss your sources — real MP3 audio with a synced, clickable transcript |
| 📄 Report | Executive summary, analytical sections, key takeaways, open questions |
| 🧾 Briefing doc | Under 700 words: bottom line, evidence, risks, next steps |
| 📊 Infographic | Headline stats, themed sections, key takeaway — **17 styles** incl. charts, comparisons, checklists |
| 🕸️ Mind map | Interactive concept tree — starts collapsed, expand topic by topic |
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

## Infographic styles

Pick a style in the Studio panel before generating. Seventeen are available,
drawn from two well-known sets of infographic prompt templates — one visual,
one structural — reconciled into a single list.

**Structure-led** — these change what the infographic *is*:

| | |
|---|---|
| **Data-driven** headline stats, a real bar chart, then interpretation | **Process flow** numbered stages, each with its own detail |
| **Comparison** two options side by side, with a verdict | **Checklist** 6-10 actionable items in working order |
| **Educational** what it is, why it matters, how to apply it | |

**Look-led** — these change the treatment: **Classic**, **Flat vector**,
**Bento grid**, **Corporate report**, **Minimal mono**, **Editorial feature**,
**Neon network**, **Paper cutout**, **Clay explainer**, **Sketch note**,
**Chalkboard lesson**, **Watercolor story**.

Even the look-led styles change the content, because the two are not separable:
a chalkboard lesson wants one rule and three examples, a corporate report wants
a headline metric and next steps, minimal wants the material cut to five points.
Each style contributes its own guidance to the generation prompt and returns
only the fields it needs.

### What was merged, and what was left out

*Process flow* is a deliberate merge. An "isometric connected system" and a
"numbered process" are the same format wearing different clothes — both are an
ordered sequence with arrows — so keeping both would have been a palette swap
pretending to be a structure. The merged style keeps the isometric sense of
connection and the process emphasis on direction, and fixes the flaw both
originals shared: stage names now carry their own detail instead of sitting in a
disconnected row above unrelated cards. The prompt also asks the model to make
each hand-off explicit, so the stages read as a chain rather than a list.

Three templates were deliberately not adopted. *Timeline* already exists as its
own Studio format, where it gets a proper chronological layout. *Lead magnet* and
*product benefits* are marketing briefs built around a product, brand and
call-to-action — a notebook grounded in your own sources has none of those, and
inventing them would violate the one rule the whole app rests on.

Infographics render as **real HTML, not generated images**: the text stays
selectable and searchable, citations remain hoverable, the layout reflows on
narrow screens, and nothing is misspelled by an image model. Citation pills pick
up each theme's accent colour rather than the app's dark default.

---

## Adding sources

Ingestion is **non-blocking**. Each source is sent as its own request and shows
a spinner in the Sources list while it is extracted, chunked, embedded and
summarised. You can keep dropping files, pasting links or running a discovery
search while earlier items are still processing; a failure affects only its own
row, which explains what happened and can be dismissed. Sources join the chat
context automatically as they land.

### Discover (🔎 Find)

Describe a topic and OpenNotebook searches the web, then lets you choose which
pages to add — checkboxes, snippets, and a link to preview each one first.

Two things make the results usable rather than noisy:

- **Query expansion.** The model rewrites your topic into three queries covering
  different angles, and results are merged and de-duplicated. If Azure OpenAI is
  unavailable it falls back to searching your text literally.
- **Reachability checks.** Many publishers refuse automated fetches, which is
  especially annoying for a link you did not hand-pick. Candidates are probed in
  parallel before they are shown; blocked ones are badged **may block import**,
  sorted last, and left out of the default selection. Pages already in the
  notebook are marked and cannot be added twice.

No API key is needed — discovery uses DuckDuckGo by default. Set any of
`TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, or `GOOGLE_SEARCH_API_KEY` +
`GOOGLE_SEARCH_CX` to use a higher-quality provider instead; the first one
configured wins.

---

## Mind maps

Mind maps open **fully collapsed**, showing only the central topic with a badge
counting its subtopics. Clicking a node expands it one level; clicking again
collapses it along with everything beneath, so re-opening a branch starts tidy
rather than restoring a sprawl. **Expand all** and **Collapse all** are there
when you want the whole picture at once.

The layout is computed over only the visible nodes and refits after every
change, so the map always stays in view, and nodes glide between positions
instead of jumping. Branches are colour-coded from the root, nodes carry their
source note as a tooltip, and the whole tree is keyboard reachable with proper
`aria-expanded` state.

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

Paste a YouTube URL into **Link**. `watch?v=`, `youtu.be`, `/shorts/` and
`/embed/` forms are all recognised.

Setting a Data API v3 key improves this considerably:

```ini
YOUTUBE_API_KEY=...
```

It supplies authoritative title, channel, duration and description, and a
definitive list of caption tracks. What it cannot do is return caption *text* —
`captions.download` rejects API keys outright (`401: API keys are not supported
by this API`) and requires OAuth as the **video's owner**, so it is no help for
third-party videos.

### When the transcript is unavailable

YouTube's public transcript endpoint is gated behind a proof-of-origin token.
Without one it answers `200` with an **empty body** rather than an error, so on
many networks — most corporate and datacenter ranges included — transcripts
cannot be fetched at all.

The app handles this honestly rather than reporting "no captions available":

- It names the caption tracks the Data API confirms exist, so you know the
  captions are there and the refusal is YouTube's.
- It falls back to ingesting the video **description**, which is often
  substantial, clearly labelled `(description only)` with an in-text note and a
  warning in the Sources panel — you are never led to believe you got a
  transcript. Descriptions under 200 characters are rejected instead.
- `YOUTUBE_COOKIE` (the `Cookie` header from a signed-in session) is used when
  set, for networks where that is sufficient.

For a guaranteed full transcript, use **Paste** to add it as a text source.

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

### Changing the embedding model

Embeddings from different models occupy unrelated vector spaces, so their
similarity scores are meaningless against each other. Worse, comparing them
returns a plausible-looking number rather than an error, which would quietly
reduce retrieval to noise with nothing to indicate why.

Every chunk therefore records the model and dimension it was embedded with.
Retrieval compares only vectors that match the current model, counts any that
do not, and reports the shortfall in chat:

> 12 of 40 passages were embedded with nomic-embed-text, not the current
> text-embedding-3-large, so they were ranked by keyword only. Re-embed this
> notebook to restore semantic search.

Those chunks still participate through keyword ranking, so answers degrade
rather than disappear. To repair a notebook:

```bash
# how many chunks are stale
curl localhost:3000/api/notebooks/<id>/reembed

# re-embed them with the current model
curl -X POST localhost:3000/api/notebooks/<id>/reembed
```

Databases created before this was added are migrated automatically: dimensions
are recovered from the stored blob, and the model is inferred from the
configured deployment, which is the only one that could have produced them.

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
      notebooks/[id]/reembed/      embedding-model status and repair
      discover/                    web search for candidate sources
      sources/[id]/                read full text, delete
      chat/                        NDJSON streaming, grounded answers
      generate/                    studio artifact generation
      podcast/                     dialogue script + speech synthesis
      audio/[id]/                  MP3 streaming with byte-range support
      artifacts/[id]/              delete
  components/
    Workspace  SourcesPanel  ChatPanel  StudioPanel
    ArtifactModal  SourceModal  DiscoverModal
    MindMap  Quiz  Infographic  PodcastPlayer  Markdown
  lib/
    db.ts        SQLite schema (node:sqlite, no native build step)
    ai.ts        Azure OpenAI client (Entra ID auth), chat / JSON / embeddings
    infographic.ts  style registry: themes + per-style content guidance
    speech.ts    Azure Speech dialogue synthesis
    websearch.ts pluggable search providers + reachability probing
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
