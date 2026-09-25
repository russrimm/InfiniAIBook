# InfiniAIBook

A self-hosted Agentic Powered Notebook research studio. Upload your own sources, chat with
them, and turn them into **reports, briefings, infographics, mind maps, quizzes,
study guides, FAQs and timelines** — every claim cited back to the document it came from.

Built with Next.js 15, TypeScript and SQLite. Runs against Azure OpenAI, a dozen
named providers (OpenAI, Anthropic, Gemini, Groq, Mistral, DeepSeek, OpenRouter,
xAI, Perplexity, Together) or any OpenAI-compatible endpoint, including local
models via Ollama, llama.cpp or LM Studio.

Inspired by [open-notebook](https://github.com/lfnovo/open-notebook): notes,
transformations, multiple chat sessions, cross-notebook search, audio/video
transcription, multi-speaker podcasts, password protection and a Docker image
are all here too.

> **Single-user.** Without `INFINIAIBOOK_PASSWORD`, anyone who can reach the
> server can use it, and your model quota with it. Run it on localhost, set a
> password, or put it behind an authenticating proxy — see [SECURITY.md](SECURITY.md).

**Contents:** [Screenshots](#screenshots) ·
[What it does](#what-it-does) ·
[Notes, sessions and search](#notes-sessions-and-search) ·
[Exporting](#exporting) ·
[Quick start](#quick-start) ·
[Docker](#docker) ·
[Password protection](#password-protection) ·
[Configuration](#configuration) ·
[Environment variables](#environment-variables) ·
[Authentication](#authentication-microsoft-entra-id) ·
[Infographic styles](#infographic-styles) ·
[Adding sources](#adding-sources) ·
[Study aids](#study-aids) ·
[Audio overviews](#audio-overviews) ·
[Images as sources](#images-as-sources) ·
[Whiteboard videos](#whiteboard-videos) ·
[YouTube sources](#youtube-sources) ·
[How grounding works](#how-grounding-works) ·
[Architecture](#architecture) ·
[Contributing](#contributing) ·
[Licence](#licence)

## Screenshots

Captured from the app with a fictional community-garden sample notebook.
Sources, chat responses, notes and artifacts shown here are prepared demo content.

### Research workspace

Sources, cited answers and Studio tools in one view. Expand citations to inspect
the source excerpts behind an answer, switch between chat sessions from the bar
above the conversation, and cast one to four speakers for an audio overview.

![InfiniAIBook workspace with four selected sources, a chat session picker, a cited chat answer and Studio generation tools including a multi-speaker audio overview](docs/screenshots/workspace.png)

### Notes and chat sessions

The right-hand column flips between Studio and Notes. Keep your own Markdown
notes alongside saved chat answers and transformation results, each one
openable, editable and convertible into a source. See
[Notes, sessions and search](#notes-sessions-and-search).

![Notes panel listing a saved chat answer, an AI-generated action list and a handwritten note, next to a second chat session about the watering rota](docs/screenshots/notes.png)

### Transformations

Eight built-in prompts, plus any you write, that run on one source and save the
result as a note.

![Transformations dialog listing the eight built-in prompts, from Dense summary to Action items, with a button to add a new one](docs/screenshots/transformations.png)

### Search and Ask across notebooks

Search every notebook's sources and notes at once, or ask one question and get
a single grounded answer that cites the notebook each passage came from.

![Search your library page with a grounded answer about the watering rota citing sources from three different notebooks](docs/screenshots/search.png)

### Interactive mind map

Explore topics branch by branch, expand the full tree, or export it as a PNG.

![Expanded community-garden mind map showing pilot goals, growing spaces, shared care and planning](docs/screenshots/mind-map.png)

### Illustrated infographic

Turn source material into visual summaries with key figures, themed sections
and citations back to the evidence.

![Illustrated community-garden infographic with headline figures, visual concepts and source citations](docs/screenshots/infographic.png)

The same notebook rendered in every other HTML style is in the
[infographic style gallery](#style-gallery).

---

## What it does

| | |
|---|---|
| **Sources** | Upload PDF, DOCX, TXT, MD, CSV, JSON, HTML, **images** (described by a vision model) or **audio/video** (transcribed); paste raw text; reuse a source from **another notebook**; add a URL — including **YouTube links** and **RSS/Atom feeds**; or **discover sources** by describing a topic and picking from web results; or browse the web in-app and keep what is useful. Ingestion runs in the background, so you can keep adding while earlier items process. |
| **Grounded chat** | Streaming answers built only from the sources you have selected, with hoverable inline citations `[1]` that show the exact excerpt used. Keep any number of separate **chat sessions** per notebook. |
| **Notes** | Write your own Markdown notes, save any chat answer as a note (citations kept), and turn a note into a source. |
| **Transformations** | Reusable prompts — built-in (dense summary, key insights, analyze paper, glossary…) or your own — run on one source and saved as a note. |
| **Search everything** | Keyword or semantic search across every notebook's sources and notes, plus a one-shot grounded **Ask** over the whole library. |
| **Studio** | Eleven generators, each returning a structured, validated artifact rendered with a purpose-built view — not a wall of text. |
| **Everything is local** | Sources, chunks, embeddings, chat history, artifacts, generated audio, voice samples and images live under `.data/`. |

### Studio formats

| Format | Output |
|---|---|
| 🎧 Audio overview | One to four speakers discuss your sources — real MP3 audio with a synced, clickable transcript, at roughly 3, 6 or 10 minutes |
| 🎬 Whiteboard video | A hand draws your sources as marker doodles, narrated — six scenes, MP4 |
| 📄 Report | Executive summary, analytical sections, key takeaways, open questions |
| 🧾 Briefing doc | Under 700 words: bottom line, evidence, risks, next steps |
| 📊 Infographic | Headline stats, themed sections, key takeaway — **20 styles**, visual guide by default |
| 🕸️ Mind map | Interactive concept tree — starts collapsed, expand topic by topic |
| 🧠 Quiz | Multiple-choice, interactive, scored, with explanations and retry-the-misses |
| 🗂️ Flashcards | Two-sided deck: flip, self-grade, shuffle, drill the ones you missed |
| 🎓 Study guide | Core concepts, glossary table, short-answer questions + answer key |
| ❓ FAQ | Collapsible Q&A the sources actually answer |
| 🗓️ Timeline | Chronology extracted from the material |

Every artifact can be copied or exported to Markdown; audio can be downloaded as
MP3, and flashcards export as a two-column table that Anki and Quizlet accept.

---

## Notes, sessions and search

### Chat sessions

The bar above the chat lists every conversation in the notebook. **＋ New**
starts a fresh one (created on its first question and named after it), ✎
renames and 🗑 deletes. Follow-up context only comes from the session you are
in, so an unrelated question in a new session is not coloured by an old thread.
Chat history from before sessions existed is kept as "Earlier conversation".

### Notes

The right-hand column switches between **Studio** and **Notes** (on phones,
Notes has its own tab). A note is Markdown you write yourself, or model output
you chose to keep:

- **🗒️ Save to notes** under any chat answer keeps it, citations included.
- **Apply → note** in a source's reader runs a transformation on that source.
- **➕ Add as source** copies a note into the notebook's sources, so chat and
  the Studio can draw on it. The copy does not change if you edit the note.

### Transformations

A transformation is a named prompt applied to one source at a time. Eight
ship built in — Dense summary, Key insights, Analyze paper, Explain simply,
Table of contents, Reflection questions, Glossary and Action items — and
**⚙ Transformations** in the Notes panel lets you add, edit and delete your
own. Results are grounded and cited like everything else.

### Search and Ask

**🔎 Search** (home page and notebook header) searches every notebook at once.
*Keyword* ranking needs no model; *Semantic* blends embedding similarity the way
chat retrieval does and falls back to keywords if embeddings are unavailable.
Notes are matched too. **✨ Ask** returns one grounded answer drawn from the
best passages across the whole library, citing the notebook each came from.
From inside a notebook you can tick *Only this notebook* to narrow it.

### Reusing sources across notebooks

**📚 Library** in the Sources panel lists sources from your other notebooks.
Picked ones are copied with their text, summary and embeddings, so nothing is
fetched or embedded again and the copy is independent afterwards.

---

## Keeping linked sources current

A page you indexed last month is not necessarily the page that is there now.
When a notebook opens, its linked sources are re-fetched in the background and
compared with what was indexed. Nothing is applied automatically — re-indexing
replaces what the notebook knows, which is exactly the kind of change that
should need a decision.

Changed sources surface as a banner. Opening it shows, per source, the size
before and after and the first few added and removed lines, with **Re-index** or
**Keep current** for each. Re-indexing re-chunks and re-embeds that source
alone; keeping it records the new version as the baseline so the same change is
not raised again.

Checks are paced at **once every six hours per source**. A twenty-two source
notebook re-fetched on every open would put hundreds of requests through
publishers that will eventually rate-limit or block you. Fetches run four at a
time, and a source already awaiting a decision is never re-fetched — that would
move the goalposts under a question you have not answered.

### Two things this had to get right

**Reflow is not a change.** The first implementation compared lines and called
eleven of fifteen live pages "changed" when none were. A journal name moving
across a line break registers as several additions and removals while the prose
is identical; so do breadcrumbs, ad slots and "no membership required" promos.
Materiality is now judged on words — which survive reflow — and a change must be
at least 40 words *and* 1.5% of the page before it is worth interrupting anyone.
That took the same fifteen sources to zero false positives.

**A bot check is not content.** Re-checking those sources found four publishers
now serving an interstitial — `Checking your browser before accessing
pmc.ncbi.nlm.nih.gov` — with a 200 status and a perfectly well-formed page.
Approving one would have replaced 233,000 characters of indexed research with
130 characters of nothing. Fetches that look like a gate, either by their
wording or by collapsing below 40% of the indexed size, are reported as a
problem and the indexed copy is kept. Improvement in the other direction — a
page that was blocked and now is not — is still offered normally.

RSS and Atom feeds are read as feeds rather than pages: entries are flattened to
title, date, body and link, so a feed that gains an item registers as new
content instead of unparsed XML.

---

## Exporting

| Artifact | Formats |
|---|---|
| Audio overview | **MP3**, Markdown transcript |
| Infographic | **PNG**, Markdown |
| Mind map | **PNG**, Markdown outline |
| Flashcards | **CSV** (Anki/Quizlet), Markdown table |
| Everything else | Markdown |

PNG export rasterises the artifact at 2× for a sharp image. The AI image style
is downloaded from the server instead of being captured from the screen, since
capturing it would resample the original through whatever width the window
happens to be. CSV is written with a BOM so Excel does not mangle accented
characters, and citation markers are stripped — they are internal navigation,
not part of a flashcard.

---

## Quick start

**Prerequisites**

- **Node.js 22.13 or later** — the database uses the built-in `node:sqlite`.
- **A model provider** — a key for one of the [named providers](#named-providers),
  an Azure OpenAI resource with a chat and an embedding deployment, or any
  OpenAI-compatible server (see [Configuration](#configuration)).
- *Optional:* the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
  for Entra sign-in; an Azure Speech resource for audio overviews and videos;
  Python 3 for whiteboard videos; Gemini / YouTube / search API keys for the
  features described below. Everything optional degrades cleanly when unset.

```bash
npm install
cp .env.example .env.local   # then set your endpoint + deployment names
az login                     # Entra sign-in; see Authentication below
npm run dev
```

Open <http://localhost:3000>. For a production build, `npm run build` then
`npm start`. Add `-- -H 127.0.0.1` to either command to keep the server off
your network.

Upgrading from OpenNotebook? An existing `.data/opennotebook.db` is renamed to
`.data/infiniaibook.db` on first start; nothing else needs to change.

### Docker

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
lines in the [`Dockerfile`](Dockerfile) to include it.

### Password protection

Set `INFINIAIBOOK_PASSWORD` and every page and API route requires it. The
browser signs in at `/login` (a 30-day, HTTP-only cookie); scripts send
`Authorization: Bearer <password>`. It is a single shared password for a
personal instance, not multi-user accounts — see [SECURITY.md](SECURITY.md).

### Configuration

InfiniAIBook talks to any **OpenAI-compatible** endpoint, or to Azure OpenAI.

#### Named providers

The quickest route is a preset: set `AI_PROVIDER` and that provider's usual key
variable, and the base URL and default models are filled in.

```ini
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
# AI_MODEL=gpt-4o                       # optional: override the preset's model
```

| `AI_PROVIDER` | Key variable | Default chat model | Embeddings | Transcription |
|---|---|---|---|---|
| `openai` | `OPENAI_API_KEY` | gpt-4o-mini | text-embedding-3-small | whisper-1 |
| `anthropic` | `ANTHROPIC_API_KEY` | claude-sonnet-4-5 | — | — |
| `gemini` | `GEMINI_API_KEY` | gemini-2.5-flash | gemini-embedding-001 | — |
| `groq` | `GROQ_API_KEY` | llama-3.3-70b-versatile | — | whisper-large-v3 |
| `mistral` | `MISTRAL_API_KEY` | mistral-small-latest | mistral-embed | — |
| `deepseek` | `DEEPSEEK_API_KEY` | deepseek-chat | — | — |
| `openrouter` | `OPENROUTER_API_KEY` | openai/gpt-4o-mini | — | — |
| `xai` | `XAI_API_KEY` | grok-3-mini | — | — |
| `perplexity` | `PERPLEXITY_API_KEY` | sonar | — | — |
| `together` | `TOGETHER_API_KEY` | Llama-3.3-70B-Instruct-Turbo | bge-large-en-v1.5 | — |
| `ollama` | none (local) | qwen3.5:latest | nomic-embed-text | — |
| `lmstudio` / `llamacpp` | none (local) | set `AI_MODEL` | set `AI_EMBEDDING_MODEL` | — |
| `azure` | Entra ID or `AZURE_OPENAI_API_KEY` | see below | | |

**Mixing providers.** Embeddings (for semantic retrieval) and transcription
(for audio/video sources) can go to a different provider from chat, which is
what a chat-only provider such as Anthropic needs:

```ini
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
AI_EMBEDDING_PROVIDER=openai          # or AI_EMBEDDING_BASE_URL / _API_KEY / _MODEL
AI_TRANSCRIPTION_PROVIDER=groq        # or AI_TRANSCRIPTION_BASE_URL / _API_KEY / _MODEL
OPENAI_API_KEY=...
GROQ_API_KEY=...
```

Without an embedding endpoint the app still works; retrieval falls back to
keyword ranking and says so.

#### Custom endpoints

**Local or third-party** — set a base URL and it takes precedence over Azure:

```ini
AI_BASE_URL=http://localhost:8080/v1   # llama.cpp llama-server
AI_MODEL=qwen3.5:latest
AI_EMBEDDING_MODEL=nomic-embed-text
# AI_API_KEY=                          # only if the endpoint needs one
```

Works with llama.cpp's `llama-server`, Ollama (`:11434/v1`), LM Studio
(`:1234/v1`), vLLM, or OpenAI itself. Chat and embeddings are separate models:
llama.cpp needs `--embeddings`, Ollama needs a dedicated embedding model
(`ollama pull nomic-embed-text`).

> **Expect it to be slow without a GPU.** Measured on a CPU-only VM via Ollama:
> ingesting one short source took 8m34s, and a one-line chat answer 2m52s. The
> same work on Azure takes seconds. On a GPU or Apple Silicon this is far
> quicker, but "no API key needed" is not the same as "fast".

**Azure OpenAI** — used when neither `AI_PROVIDER` nor `AI_BASE_URL` is set
(or with `AI_PROVIDER=azure`):
```ini
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_DEPLOYMENT=gpt-5                             # chat deployment name
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large  # embedding deployment name
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-2.5-sunburst      # optional, for image infographics
# DATA_DIR=./.data                                        # optional
```

These deployment values are **deployment names** from Azure AI Foundry, not model names.
List what your resource actually has:

```bash
az cognitiveservices account deployment list -n <resource> -g <rg> -o table
```

### Environment variables

Set these in `.env.local`; [`.env.example`](.env.example) has every one with
commentary. Only a model provider is required.

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` + the provider's key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …) | Named provider preset; see [Named providers](#named-providers) |
| `AI_BASE_URL`, `AI_MODEL`, `AI_EMBEDDING_MODEL`, `AI_API_KEY` | OpenAI-compatible provider, or overrides for a preset; takes precedence over Azure |
| `AI_EMBEDDING_PROVIDER`, `AI_EMBEDDING_BASE_URL`, `AI_EMBEDDING_API_KEY` | Send embeddings to a different provider from chat |
| `AI_TRANSCRIPTION_PROVIDER`, `AI_TRANSCRIPTION_BASE_URL`, `AI_TRANSCRIPTION_API_KEY`, `AI_TRANSCRIPTION_MODEL` | Speech-to-text for audio/video sources |
| `AI_IMAGE_MODEL`, `AI_VISION_MODEL` | Image-generation and image-reading models (override the Azure equivalents) |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION` | Azure OpenAI resource and data-plane API version |
| `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Chat and embedding deployment names |
| `AZURE_OPENAI_IMAGE_DEPLOYMENT`, `AZURE_OPENAI_IMAGE_API_VERSION` | Optional image model for AI-image infographics and videos |
| `AZURE_OPENAI_VISION_DEPLOYMENT` | Optional vision model for image sources; defaults to the chat deployment |
| `AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT` | Optional Whisper / gpt-4o-transcribe deployment for audio/video sources |
| `AZURE_OPENAI_API_KEY` | Legacy key auth; takes precedence over Entra when set |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Service principal or user-assigned identity for Entra auth |
| `AZURE_SPEECH_REGION`, `AZURE_SPEECH_RESOURCE_ID`, `AZURE_SPEECH_KEY` | Azure Speech for audio overviews and video narration |
| `STUDIO_CONTEXT_CHARS` | Starting source budget for Studio generation (default `30000`) |
| `TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` | Optional discovery providers; DuckDuckGo is used without them |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | YouTube transcripts via Gemini |
| `YOUTUBE_API_KEY`, `YOUTUBE_COOKIE`, `YOUTUBE_CAPTION_LANG` | YouTube metadata and transcript fallbacks |
| `PYTHON_BIN` | Python interpreter for the whiteboard renderer (default `python`) |
| `ALLOW_PRIVATE_NETWORK_FETCH` | Allow fetching private/loopback addresses (default off; see [SECURITY.md](SECURITY.md)) |
| `MAX_FETCH_BYTES`, `FETCH_MAX_REDIRECTS`, `FETCH_TIMEOUT_MS` | Limits on fetched pages and files |
| `DATA_DIR` | Where the database and generated media live (default `./.data`) |
| `INFINIAIBOOK_PASSWORD` | Require a password for the UI and API (default off) |

### Checking a provider

Model servers differ in what they actually support, and the gaps only show up
in use. `check:ai` exercises the real code paths against whatever is configured:

```bash
npm run check:ai              # connectivity, chat, streaming, JSON, embeddings
npm run check:ai -- --studio  # also generate all 9 text Studio formats
npm run check:ai -- --styles  # also generate an infographic in every style
npm run check:ai -- --image   # also render a test image
```

It imports the application's own modules, so it cannot drift from what the app
does, and it compares the live embedding size against what is already stored —
catching a model change that would otherwise degrade retrieval silently.

Reference run against Azure `gpt-5-mini`:

```
core
  PASS  chat           3.7s      PASS  embeddings  0.5s — 3072 dims
  PASS  streaming      1.4s      PASS  stored      517 chunks, all 3072 dims
  PASS  json mode      2.1s
studio formats
  PASS  Report        12.3s      PASS  Quiz        21.9s
  PASS  Briefing doc  10.6s      PASS  Study guide 19.2s
  PASS  Infographic   11.9s      PASS  FAQ          7.6s
  PASS  Mind map      15.0s      PASS  Timeline    14.2s
```

### Moving to local inference

1. Start a server with **both** chat and embedding models available —
   `llama-server --port 8080 -m model.gguf --embeddings`, or
   `ollama serve` plus `ollama pull nomic-embed-text`.
2. Point `AI_BASE_URL`, `AI_MODEL` and `AI_EMBEDDING_MODEL` at it.
3. Run `npm run check:ai -- --studio`. Structured output is where smaller models
   struggle, and this reports exactly which formats come back malformed rather
   than leaving you to discover it one artifact at a time.
4. Notebooks embedded by the previous model will rank by keyword only until
   repaired; the check warns when it sees this. Fix per notebook with
   `POST /api/notebooks/<id>/reembed`.

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

Pick a style in the Studio panel before generating. Twenty are available.

**Visual guide** is the default: an image-model rendering in the shape of a
polished enterprise explainer. The brief names one central **hub** — the
currency, platform or mechanism the topic revolves around — and three thematic
regions around it, joined to the hub by glossy gradient ribbons. Where the
sources support them it adds a **scale** of graded tiers (light to heavy, with
cited figures), an N-way **comparison matrix** of 2–4 options, and a **pro tip**
callout. Like the AI image style it needs an image deployment; see
[Image infographics](#image-infographics). Pick **Illustrated** if you have none.

**Illustrated** is the HTML alternative: a wide editorial piece that turns each idea into
a visual metaphor rather than a box of prose. It identifies the 6–10 most
important ideas, groups them into 2–3 thematic regions, and gives each a bold
takeaway, a hand-drawn SVG metaphor, one or two cited sentences, and an
oversized figure where the sources state a real one.

Metaphors are chosen by meaning, from a fixed vocabulary the prompt supplies —
scales for comparisons, gauges for limits, pipes for flows, coins for cost,
gears for configuration, shields for security, funnels for optimisation,
roadmaps for processes, and ten more. They are drawn as inline SVG in one visual
language (navy outlines, rounded geometry, blue/teal/green with selective
orange), so they stay crisp at any size, tint to match their region, and never
misspell a label.

**AI image** renders the infographic as a real picture with an image model,
using the same grounded brief the illustrated style produces. See
[Image infographics](#image-infographics) below.

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

### Style gallery

Every example below was generated by the app from the same fictional
community-garden sample notebook — a project brief, a planting and water plan,
volunteer workshop notes and a resident survey — using that style's prompt
unchanged. Nothing was edited after generation, so these show what each prompt
actually produces, citation pills included. Click an image for full size.

**Structure-led**

<table>
<tr>
<td width="50%" valign="top">
<b>📈 Data-driven</b> — four headline stats, a bar chart of figures the sources
state on one scale, then what the numbers mean.<br><br>
<a href="docs/screenshots/infographics/data.png"><img src="docs/screenshots/infographics/data.png" alt="Data-driven infographic with four headline stats, a bar chart of beds per planting zone and interpretation cards"></a>
</td>
<td width="50%" valign="top">
<b>🔗 Process flow</b> — four to six action-named stages, each carrying its own
detail and the hand-off to the next.<br><br>
<a href="docs/screenshots/infographics/process.png"><img src="docs/screenshots/infographics/process.png" alt="Process-flow infographic with four numbered stages from building beds to harvest and review"></a>
</td>
</tr>
<tr>
<td valign="top">
<b>⚖️ Comparison</b> — two options the sources set against each other, row by
row, with a balanced verdict.<br><br>
<a href="docs/screenshots/infographics/comparison.png"><img src="docs/screenshots/infographics/comparison.png" alt="Comparison infographic setting hand watering against a drip irrigation kit across cost, time, reliability, water use and crop suitability"></a>
</td>
<td valign="top">
<b>✅ Checklist</b> — six to ten imperative items in the order someone would
work through them, each cited.<br><br>
<a href="docs/screenshots/infographics/checklist.png"><img src="docs/screenshots/infographics/checklist.png" alt="Checklist infographic with eight ordered actions for running the garden pilot"></a>
</td>
</tr>
<tr>
<td valign="top">
<b>🎓 Educational</b> — exactly three sections: what it is, why it matters, how
to apply it.<br><br>
<a href="docs/screenshots/infographics/educational.png"><img src="docs/screenshots/infographics/educational.png" alt="Educational infographic with What it is, Why it matters and How to apply it sections"></a>
</td>
<td></td>
</tr>
</table>

**Look-led**

<table>
<tr>
<td width="50%" valign="top">
<b>📊 Classic</b> — the original dark studio look, with no extra shaping.<br><br>
<a href="docs/screenshots/infographics/classic.png"><img src="docs/screenshots/infographics/classic.png" alt="Classic dark infographic with headline stats and four themed sections"></a>
</td>
<td width="50%" valign="top">
<b>🔷 Flat vector</b> — the key takeaway printed first, then five to seven short
labelled facts.<br><br>
<a href="docs/screenshots/infographics/flat.png"><img src="docs/screenshots/infographics/flat.png" alt="Flat vector infographic leading with the key takeaway above headline stats"></a>
</td>
</tr>
<tr>
<td valign="top">
<b>🍱 Bento grid</b> — sections ranked by importance; the first card is largest
and carries the main conclusion.<br><br>
<a href="docs/screenshots/infographics/bento.png"><img src="docs/screenshots/infographics/bento.png" alt="Bento-grid infographic with a wide lead card and smaller cards below"></a>
</td>
<td valign="top">
<b>🏢 Corporate report</b> — a headline metric first, a clean grid of sections
and three concrete next steps.<br><br>
<a href="docs/screenshots/infographics/corporate.png"><img src="docs/screenshots/infographics/corporate.png" alt="Corporate-report infographic with uppercase section headings and numbered next steps"></a>
</td>
</tr>
<tr>
<td valign="top">
<b>⬜ Minimal mono</b> — cut to the five most essential points in at most three
sections.<br><br>
<a href="docs/screenshots/infographics/minimal.png"><img src="docs/screenshots/infographics/minimal.png" alt="Minimal monochrome infographic with red accents and three short sections"></a>
</td>
<td valign="top">
<b>📰 Editorial feature</b> — a standfirst subtitle, article-style subheads and
a pull quote drawn from the sources.<br><br>
<a href="docs/screenshots/infographics/editorial.png"><img src="docs/screenshots/infographics/editorial.png" alt="Editorial magazine-style infographic in serif type with a pull quote"></a>
</td>
</tr>
<tr>
<td valign="top">
<b>🌐 Neon network</b> — a route through the topic as four to six connected
nodes, phrased as cause and effect.<br><br>
<a href="docs/screenshots/infographics/neon.png"><img src="docs/screenshots/infographics/neon.png" alt="Neon network infographic on a dark background with four glowing connected route nodes"></a>
</td>
<td valign="top">
<b>✂️ Paper cutout</b> — layered cards, biggest fact first, each later section
shorter than the last.<br><br>
<a href="docs/screenshots/infographics/cutout.png"><img src="docs/screenshots/infographics/cutout.png" alt="Paper-cutout infographic in warm paper tones with a large lead section"></a>
</td>
</tr>
<tr>
<td valign="top">
<b>🫧 Clay explainer</b> — friendly role-style headings and plain, jargon-free
captions.<br><br>
<a href="docs/screenshots/infographics/clay.png"><img src="docs/screenshots/infographics/clay.png" alt="Clay-explainer infographic with rounded cards headed The Garden, Water Team, Volunteer Roles and Community Pulse"></a>
</td>
<td valign="top">
<b>✏️ Sketch note</b> — hand-lettered clusters of punchy fragments under ten
words, with emoji doodles.<br><br>
<a href="docs/screenshots/infographics/sketch.png"><img src="docs/screenshots/infographics/sketch.png" alt="Sketch-note infographic with dashed hand-drawn borders and handwritten lettering"></a>
</td>
</tr>
<tr>
<td valign="top">
<b>🧑‍🏫 Chalkboard lesson</b> — one central rule as the takeaway, supported by
three examples.<br><br>
<a href="docs/screenshots/infographics/chalkboard.png"><img src="docs/screenshots/infographics/chalkboard.png" alt="Chalkboard-lesson infographic in chalk-style lettering on a dark green board"></a>
</td>
<td valign="top">
<b>🎨 Watercolor story</b> — a calm beginning, middle and end, with the line that
captures the whole arc as a pull quote.<br><br>
<a href="docs/screenshots/infographics/watercolor.png"><img src="docs/screenshots/infographics/watercolor.png" alt="Watercolor-story infographic with soft washes and Beginning, Middle and End sections"></a>
</td>
</tr>
</table>

**Illustrated** is shown under [Screenshots](#illustrated-infographic).
**Visual guide** and **AI image** are not pictured, since their output depends on
which image model you deploy.

Infographics render as **real HTML, not generated images** — with one opt-in
exception, below. HTML keeps the text selectable and searchable, citations
hoverable, the layout reflowing on narrow screens, and nothing misspelled by an
image model. Citation pills pick up each theme's accent colour rather than the
app's dark default.

### Image infographics

The **Visual guide** and **AI image** styles render the infographic as a
picture instead. They run in two stages: the generation model first writes a
grounded brief — headline, three regions, a takeaway, one cited sentence and an
optional real figure per concept, plus the hub, scale and matrix for the visual
guide — and that brief is then turned into the
image prompt. Nothing reaches the image model that did not come from your
sources, and the brief is stored alongside the PNG.

That two-stage design exists because of what an image cannot do. Text inside a
picture is not selectable, not searchable, and cannot carry a citation. So the
artifact shows the image first and the brief underneath, with its citation pills
intact — you get the illustration without losing the evidence trail.

Configure a deployment and pick it under **Models → Image model**:

```bash
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-2.5-sunburst
```

**Which model.** `gpt-image-2.5-sunburst` is the recommended default. It is
tuned for detail and editing precision, which is exactly what a dense
infographic needs: in testing it lettered every heading, stat and caption
correctly and laid the regions out as a connected editorial spread.
`gpt-image-2.5-flare` is roughly 2.5× faster (27s against 63s for the same
prompt) and also spelled everything correctly, but arranges the content as three
rigid columns — closer to a slide than to the editorial journey the style asks
for. Use Flare for quick drafts, Sunburst for the finished artifact. The picker
also accepts `gpt-image-1.x`, FLUX and other deployed image models.

Generation takes around 100 seconds end to end, most of it in the image model.
Check it independently with:

```bash
npm run check:ai -- --image
```

The prompt instructs the model to letter every string verbatim and invent no
other text. Image models are far better at this than they were, but the
instruction is not a guarantee — the app says so under each generated image, and
the cited brief beneath it remains the authoritative copy.

---

## Adding sources

**Audio and video files** (MP3, M4A, WAV, OGG, FLAC, WebM, MP4, up to 25 MB)
and direct links to them are transcribed with the configured speech-to-text
model (`whisper-1` on OpenAI, `whisper-large-v3` on Groq, or an Azure
transcription deployment) and indexed like any other text.

Ingestion is **non-blocking**. Each source is sent as its own request and shows
a spinner in the Sources list while it is extracted, chunked, embedded and
summarised. You can keep dropping files, pasting links or running a discovery
search while earlier items are still processing; a failure affects only its own
row, which explains what happened and can be dismissed. Sources join the chat
context automatically as they land.

### Discover (🔎 Find)

Describe a topic and InfiniAIBook searches the web, then lets you choose which
pages to add — checkboxes, snippets, and a link to preview each one first.

Two things make the results usable rather than noisy:

- **Query expansion.** The model rewrites your topic into three queries covering
  different angles, and results are merged and de-duplicated. If Azure OpenAI is
  unavailable it falls back to searching your text literally.
- **Reachability checks.** Many publishers refuse automated fetches, which is
  especially annoying for a link you did not hand-pick. Candidates are probed in
  parallel before they are shown, using the same headers ingestion will use, so
  the prediction matches the real result. Blocked ones are badged **may block
  import**, sorted last, and left out of the default selection. Pages already in
  the notebook are marked and cannot be added twice.

### Built-in browser (🌐 Browse)

An address bar, the page, and **Add to sources**. It tells you when a page is
already a source in this notebook rather than letting you add it twice.

Roughly **half of sites refuse to be framed**. Measured across 28 real sources,
13 sent `X-Frame-Options` or a restrictive `frame-ancestors` — including PMC,
arXiv, GitHub and the BBC, which is to say exactly the research sites this tool
is pointed at. The browser enforces that, and nothing here can override it.

So the panel checks the response headers *before* deciding how to show a page.
Where framing is allowed, the real page loads in a sandboxed frame. Where it is
not, the page opens in a reader view built by the same extractor that indexing
uses — which means what you are reading is precisely what would be stored, and
you can confirm the extraction worked before committing the source. The reader
also lists the page's outbound links, so it is navigable rather than a dead end,
and Back walks the history.

Nothing is lost by the fallback: a page that cannot be fetched cannot be indexed
either.

### When a page will not import

Some failures are ours to fix and some are not, so the message distinguishes
them: a `403` means the publisher refuses automated access, a DNS or TLS error
names the cause, a timeout says how long was allowed, and a page whose text is
rendered by JavaScript says so rather than claiming it is empty.

Extraction deliberately avoids removing structural elements outright. Real pages
nest `<main>` inside `<header>`, or wrap the entire document in a `<form>` —
stripping either discards the article. Instead it prefers an explicit content
container, falls back progressively, and never returns less text than reading
the whole body would have given.

For anything genuinely blocked, open the page and use **Paste**.

No API key is needed — discovery uses DuckDuckGo by default. Set any of
`TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, or `GOOGLE_SEARCH_API_KEY` +
`GOOGLE_SEARCH_CX` to use a higher-quality provider instead; the first one
configured wins.

---

## Study aids

The quiz and flashcard generators share two controls, set on their cards in the
Studio panel before generating.

**Level** changes what is tested, not just the wording. *Easy* tests recall of
stated facts and figures. *Medium* tests understanding — why something follows,
what a figure implies. *Hard* tests precise distinctions, caveats and the
relationships between separate parts of the sources. Every level is still bound
by the same rule as the rest of the app: the answer must be determined by the
excerpts, never by outside knowledge.

**Length** is a range rather than an exact count — 5–6, 10–12 or 18–20 questions;
10–12, 18–22 or 30–35 cards. Demanding an exact number invites padding, which is
the one thing a study aid must not do.

### Quiz

Multiple choice, answered in place, scored on submission, with a cited
explanation under every question. After scoring you can **retry just the ones
you missed** — the rest of the record is kept, so the score you are improving on
stays meaningful.

Answer positions are **shuffled server-side**. This is not decoration: a
generated six-question quiz put the correct answer at option A *every time*,
despite the prompt asking explicitly for varied positions. That quiz is scorable
without reading it. Shuffling on the server is deterministic where the
instruction was not, and it shuffles positions rather than values so repeated
choices cannot mislocate the answer.

### Flashcards

A two-sided deck built for recall rather than reading. The front is a single
cue — a term, a name, a date, a short question. The back is the shortest
complete answer, with its citation.

- **Flip** by clicking the card or pressing <kbd>Space</kbd>
- **Self-grade** with *Got it* / *Missed it* (<kbd>2</kbd> / <kbd>1</kbd>)
- **Skip** or step back with <kbd>←</kbd> and <kbd>→</kbd>
- **Shuffle** at any point, or **Browse all** to read the deck as a list
- At the end, **review only the cards you missed**

Progress is kept in `localStorage`, keyed by deck, so closing the artifact and
reopening it resumes where you were. It is deliberately not stored in the
database: study progress is personal and disposable, and re-drilling a deck
should never rewrite the generated content. Clearing site data clears progress.

The generator enforces the shape a flashcard needs — one idea per card, no
answer leaking into the front, no restating the front on the back — and
near-duplicate cues are dropped, because models drift into repeats on long decks.

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

The 🎧 button writes a dialogue grounded in your sources, then narrates it with
Azure Speech and stores an MP3 under `.data/audio/`.

Audio overview supports solo explainers, two-host deep dives, three-speaker
expert panels, and four-speaker debates. Each speaker can have a custom voice,
display name, and role/personality, which guides the script so turns are written
in character. Built-in episode profiles pre-fill common formats, but names and
roles can be edited before generation. Saved podcasts include speaker profiles
for transcript labels and exports, while older two-host artifacts continue to
render normally.

### Setup

Point the app at an Azure AI Services (or Speech) resource:

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

### How the script is written

The script is written to a professional podcast brief: a cold open that leads
with the most arresting thing in the material, three or more segments each
taking one distinct aspect and handing off to the next, and a close that recaps
what is worth remembering. Stage directions such as `[MUSIC: upbeat intro]` are
stripped before synthesis, so the voice never reads them aloud.

It uses `en-Multitalker:DragonHDLatestNeural`, Azure's multi-speaker voice, so a
whole exchange renders in one request and the hosts actually sound like they are
talking to each other. Turns are synthesised in small batches — a single large
request has its connection dropped by the service — and the resulting MP3s are
concatenated. Because the output is constant-bitrate, batch durations are exact,
which is what drives the synced transcript.

### Jumping to a topic

The script is written in named segments, and those become **chapters** in the
player: a dropdown and a row of chips above the transcript, plus taller marks on
the scrubber. Selecting one seeks the audio to where that topic starts, and the
dropdown follows along as it plays.

Segment titles have to name the content ("What the cost actually covers"), not
the position ("Segment 2"), because they are what a listener scans to find the
bit they want.

Chapters survive the length correction: if an over-long script is trimmed, each
marker moves with its turn rather than staying at an index that now holds
something else, and a segment cut away entirely loses its marker instead of
pointing somewhere arbitrary. Overviews generated before this existed still play
— they simply have no chapters.

### Laughter, sighs and sound effects

The hosts can react with a sound where a person would — "Ha!" at something
absurd, "Hmm." while weighing an objection, "Phew." at a large number. These are
written into the script and spoken as written, capped at two or three in a whole
conversation: they are a tic rather than warmth if overused. A generated
three-minute overview used one across fifteen turns.

What is *not* possible, and why:

**Emotion styles.** Of 116 en-US voices, only 24 declare any style, and none
declares laughter or sighing — the closest are `cheerful`, `excited`, `sad` and
`whispering`. The multitalker declares none at all, and `mstts:express-as` is
accepted and ignored rather than refused.

**Stage directions.** `(laughs)` and `[SFX: door closes]` are read aloud, word
for word. The prompt forbids them and `cleanSpoken` strips them anyway, because
a model trained on recording scripts reaches for them regardless.

**Recorded clips** are possible but not wired up. `<audio src>` genuinely works
— a two-second clip added 1.96 seconds to a multitalker turn and 1.55 to a
classic one — and `<mstts:backgroundaudio>` mixes a bed underneath rather than
appending it. Two things make it more than a one-line change: the service
fetches the URL itself, so clips must be public HTTPS rather than served from
`.data/`, and a clip it cannot reach is skipped **silently**, so a broken effect
would be invisible rather than an error.

### Voice and pace

Five controls sit on the Audio overview card:

**Length** — Short, Medium or Long, with the rough running time shown against
each:

| | Target | Typical | Generation time |
|---|---|---|---|
| Short | ~3 min | 11–14 turns | ~2.5 min |
| Medium | ~6 min | 22–26 turns | ~4 min |
| Long | ~10 min | 34–38 turns | ~6 min |

The targets come from measurement, not estimation: 2,261 words across 14.0
minutes of generated overviews works out at **161 words per minute**,
consistently across three separate notebooks. Each length is a word budget
derived from that rate.

Asking for a word count is not enough on its own. Asked for three minutes the
model wrote 885 words against a 480 target; asked for ten it wrote 3,849 against
1,610 — over twice the length, both times. So the draft is measured, and if it
misses it is rewritten with its own numbers quoted back to it ("your draft was
3,849 words, which runs about 23 minutes; the target is 10 minutes"), which is
concrete in a way a target alone is not. If a rewrite still comes back far too
long it is trimmed, keeping the opening and the closing two turns so the
conversation does not end mid-thought.

Measured after that change: 2.8 min against a 3 min target, 7.0 against 6, and
9.5 against 10.

**Hosts** — pick each voice individually from the 25 en-US DragonHD speakers,
grouped by female and male:

> Ava · Aria · Bree · Emma · Evelyn · Jane · Jenny · Mila · Nova · Paige ·
> Phoebe · Serena · Tessa · Tiana · Adam · Alloy · Andrew · Brian · Colin ·
> Davis · Jimmie · Juno · Steffan · Tyler · Vance

A name tells you nothing about how a voice sounds, so each picker has a **▶
button that plays a sample**: *"Hello, I'm Nova. It's a pleasure to meet you!"*
in that speaker's voice. Change the dropdown and press play again to audition
the next one.

Samples are rendered on first request and cached under `.data/voices/`, so the
first play of a given voice takes a second or two and every later one is
instant. The button shows `…` while rendering and `◼` while playing.

Both pickers stay active under *Fixed voices*, so the hosts you chose are the
hosts you get.

The two pickers exclude each other's current choice, because two identical
speakers render the dialogue in a single voice — which reads as a bug rather
than a decision. Names are validated server-side too, because the service does
**not** reject an unknown speaker: it quietly renders in a different voice, so a
typo would otherwise be invisible.

**Speed** — 0.8× to 1.25×, applied as SSML `prosody rate`, which the multitalker
voice takes as a multiplier and classic neural voices as a percentage offset.
Measured effect: a 1.25× overview came back at 7.7 seconds per turn against 9.7
at normal speed.

**Engine** — *Natural dialogue* (the default) renders the whole exchange through
the multitalker voice in one request, so the hosts hand off to each other.
*Even delivery* is the same voice with pause shaping switched off. *Fixed
voices* renders each turn with a named standalone voice instead.

### If a voice wanders

The multitalker is one generative model rendering a whole conversation, and the
speaker name is **conditioning, not selection** — it steers the output towards a
voice rather than loading one. So identity can drift, occasionally within a
turn.

*Fixed voices* removes that by construction: each turn names an actual voice
model, which cannot become a different one. Measured over repeated renders of
the same line:

| | Run-to-run median pitch | Within-turn spread |
|---|---|---|
| Ava, multitalker | 8% | 102 Hz |
| Ava, fixed | **2%** | 88 Hz |
| Andrew, multitalker | 9% | 88 Hz |
| Andrew, fixed | **2%** | **54 Hz** |

The cost is that turns are rendered independently, so the hosts stop reacting to
each other's delivery and it sounds a little more read-aloud.

Only **13 of the 25 speakers** exist as standalone voices — Ava, Aria, Emma,
Evelyn, Jane, Jenny, Phoebe, Serena, Adam, Andrew, Brian, Davis and Steffan. The
rest exist only inside the multitalker, and choosing one with fixed voices is
refused with the list rather than quietly substituted.

### Making it sound less read-aloud

Two things carry this, and only one of them is SSML.

**The script.** Most of the difference between speech and narrated prose is in
the writing, so the dialogue prompt asks for it directly: hard variation in turn
length, contractions throughout, sentences that qualify themselves mid-thought,
openers people actually use ("Right, so", "OK but", "Here's the thing"), and
questions that push back rather than invite more. It explicitly bans "um" and
"uh" — on a synthetic voice those read as a glitch, not as thinking.

**Pauses.** Em dashes, ellipses, opening interjections, pivots like "But" and
"Still", and the gap before a reply are rendered as real `<break>` tags, with
durations jittered per line from a seed derived from the text — so the same line
always breathes the same way, but no two lines are metronomic.

### What the voice actually supports

Established by measurement, because the service accepts markup it does not
implement and returns audio anyway:

| Feature | Result |
|---|---|
| `<break time>` | **Works, and scales** — 2500ms added 2.78s over 200ms |
| `<prosody rate>` | **Works** — 0.8 lengthens a sample by about a third |
| `<prosody volume>` | **Rejected** — HTTP 400 on the multitalker voice |
| `<mstts:express-as>` | **Accepted and ignored** — no styles declared for these voices |
| `<mstts:silence>` | Accepted, no measurable effect |
| `<prosody pitch>`, `<emphasis>`, `<prosody contour>` | Accepted; unverifiable |

That last row is the honest one. Pitch and emphasis do not change duration, and
synthesis is **not deterministic** — identical input varies about 13% run to
run — so byte comparison cannot separate a tag's effect from noise. Nothing is
built on them: markup that is silently dropped looks exactly like a working
feature.

Verified end to end: the same four turns rendered 14.69s with pauses off and
17.10s with them on, which is the inserted break time and not the tags being
read aloud.

The same choices are available on the API:

```bash
curl -X POST localhost:3000/api/podcast -H 'content-type: application/json' \
  -d '{"notebookId":"...","voices":{"a":"Davis","b":"Nova"},"rate":1.1,"length":"long"}'

# and a single speaker's sample
curl localhost:3000/api/voice-preview/Nova --output nova.mp3
```

What is *not* available on these voices: `mstts:express-as` styles. The voice
list declares none for the multitalker or for Ava, and only `empathetic` and
`relieved` for Andrew's multilingual variant. Requests carrying a style are
accepted and ignored rather than refused, so the app does not offer them.

---

## Images as sources

Drop in a PNG, JPEG, WebP, GIF or BMP — or a URL that points straight at one —
and it is described by a vision model and indexed like any other source. The
description covers the subject, every piece of readable text transcribed
exactly, chart axes and series, diagram components, and layout. From then on the
image is searchable, citable and usable by every Studio format.

Pick the model under **Models → Image reading**. It defaults to the chat model,
which is the right default only when that model has vision.

**A model without vision does not refuse the request.** It ignores the image and
answers from the prompt alone, fluently and completely wrongly. Measured on this
deployment: handed a 2.3 MB infographic about Scout fundraising, one model
billed 20 prompt tokens and described an unrelated political campaign poster
instead — confidently, in detail, and with quoted text that does not exist.

Indexing that would have put fabricated content into a notebook under a real
filename, where it would then be cited as evidence. So the prompt-token count is
checked: a request that billed too few tokens cannot have carried an image, and
the description is rejected rather than stored. The floor is derived from the
instruction length rather than hard-coded, so editing the prompt cannot quietly
start refusing working models. Measured on the same image, a blind model billed
175 tokens and a vision model billed 1214.

---

## Whiteboard videos

The 🎬 button plans six scenes from your sources, draws each one, narrates it and
renders an MP4 — a hand moving across the board, drawing the lines as they
appear, with a caption band underneath.

The **focus box** at the top of the Studio panel steers it, so the same notebook
can produce a video about whichever part of the material you want.

Each scene is planned as a picture rather than a paragraph: a short hand-lettered
title, one simple drawing described as objects rather than concepts, a caption,
and a line or two of narration. Every claim is grounded in the excerpts, and
scene prompts are barred from naming real brands, logos or people — the artwork
is original doodles.

### What it runs on

Scene artwork comes from the configured image model (`AZURE_OPENAI_IMAGE_DEPLOYMENT`
or `AI_IMAGE_MODEL`) and narration from Azure Speech, so both must be set up.
Frames are composited and encoded by a Python renderer,
`scripts/whiteboard/render.py`, which needs Python 3 with `numpy`, `Pillow`
and `imageio-ffmpeg`:

```bash
python -m pip install numpy pillow imageio-ffmpeg
```

Set `PYTHON_BIN` if `python` is not the interpreter you want.

### Timings, measured

A six-scene video took **6.5 minutes** end to end: about 3.5 minutes of artwork,
half a minute of narration, and 2.5 minutes of rendering, for a 3.6 MB file at
1280×720. Artwork dominates, and it is drawn **one scene at a time** — two
concurrent calls collide on a small image deployment's per-minute limit and
spend the retry budget racing each other rather than waiting.

Nothing blocks on it. The scene plan is written first and the artifact is saved
immediately; the build carries on in the background, writing its stage onto the
row, and the player shows the progress. Close it, keep working, come back.

### Two renderer details worth knowing

**The hand never covers the captions.** It enters from the lower right, and
composited over the whole frame it would sit across the caption band and hide
the words, so it is clipped at the band line.

**The hand cutout is generated, then checked.** A cutout with a transparent
background breaks the renderer, which converts to RGB — turning every
transparent pixel black, seeing 99.8% "ink" and putting the marker tip at pixel
(0,0), so the hand would draw with its wrist. The cutout is instead generated once on a solid white background, cached under
`.data/`, and prompted so the marker tip is the extreme upper-left point of the
hand — which is exactly where the renderer looks for it.

---

## YouTube sources

**YouTube integration is optional.** If you do not want to get an API key for
YouTube ingestion, skip it: InfiniAIBook works fine with your other sources.
A **YouTube Data API key is not required for transcripts**, either; the supported
Gemini route below uses a separate key, and **Paste** lets you add a transcript
as text without either key.

YouTube is a rich source of learning material. Bring transcripts from multiple
videos into one notebook to build material for an audiobook or generate FAQs,
learning guides and infographics grounded in those videos.

Paste a YouTube URL into **Link**. `watch?v=`, `youtu.be`, `/shorts/` and
`/embed/` forms are all recognised.

### Transcripts, the supported way

YouTube's public transcript endpoint is gated behind a proof-of-origin token,
and `captions.download` rejects API keys outright — it requires OAuth as the
**video's owner**, so it is no help for third-party videos. Neither is reachable
from a server.

The Gemini API takes a YouTube URL as a video input and fetches it on Google's
own infrastructure, which is why the gate does not apply: the request never
leaves Google. Set a key and transcripts simply work:

```ini
GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-2.5-flash
```

**This is not a YouTube Data API key.** The two are different services and a
Data API key is rejected by Gemini with `API key not valid` — get one from
[Google AI Studio](https://aistudio.google.com/apikey), or enable the
Generative Language API on the project your existing key belongs to.

It also covers videos with **no captions at all**, because the model transcribes
the audio rather than reading a caption file.

**Frames are sampled at one per ten seconds, at low resolution.** Speech lives
in the audio track, and the default sampling is expensive: on a 19-minute video
the prompt came to 330,412 tokens, of which 294,560 were video frames. At
`fps: 0.1` with `MEDIA_RESOLUTION_LOW` the same video costs 43,804 tokens and
returns in 18 seconds instead of 52 — for a transcript that came back the same
length. The frames were being paid for and discarded.

A Data API key is optional, but worth setting alongside it for richer metadata:

```ini
YOUTUBE_API_KEY=...
```

It supplies authoritative title, channel, duration and description. The two work
together — Gemini for the words, the Data API for everything around them.

### When the transcript is unavailable

Without a Gemini key, or when Gemini declines a video, the app falls back
through its original strategies and then reports honestly rather than claiming
"no captions available":

- It names the caption tracks the Data API confirms exist, so you know the
  captions are there and the refusal is YouTube's.
- It falls back to ingesting the video **description**, which is often
  substantial, clearly labelled `(description only)` with an in-text note and a
  warning in the Sources panel — you are never led to believe you got a
  transcript. Descriptions under 200 characters are rejected instead.
- `YOUTUBE_COOKIE` (the `Cookie` header from a signed-in session) is used when
  set, for networks where that is sufficient.
- When Gemini was tried and failed, the reason it gave is passed through, since
  "private, unlisted or age-restricted" is actionable and "blocked" is not.

For a guaranteed full transcript with no external service, **Paste** still adds
one as a text source.

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
    search/page.tsx                search + ask across all notebooks
    login/page.tsx                 password sign-in (when INFINIAIBOOK_PASSWORD is set)
    api/
      notebooks/                   CRUD + detail (sources, artifact summaries, sessions, notes)
      notebooks/[id]/sources/      ingestion (files | url | youtube | text | media | copyFrom)
      notebooks/[id]/sessions/     list / create chat sessions
      notebooks/[id]/notes/        list / create notes
      sessions/[id]/  notes/[id]/  read, rename / edit, delete
      transformations/             list / create; [id] edit, delete; apply → note
      search/  search/ask/         cross-notebook search and grounded ask
      sources/                     library listing for cross-notebook reuse
      auth/login/  auth/logout/    password session cookie
      notebooks/[id]/reembed/      embedding-model status and repair
      notebooks/[id]/check-sources/  re-fetch linked sources and report changes
      discover/                    web search for candidate sources
      browse/                      in-app browser: frameability check + reader view
      sources/[id]/                read full text, re-index / keep, delete
      chat/                        NDJSON streaming, grounded answers
      generate/                    studio artifact generation
      podcast/                     dialogue script + speech synthesis
      video/                       plan a whiteboard video and start its build
      models/                      list deployments, read/set the active models
      audio/[id]/  video/[id]/     MP3 / MP4 streaming with byte-range support
      image/[id]/                  generated infographic PNGs
      voice-preview/[name]/        cached voice samples
      artifacts/[id]/              fetch body on open, delete
  components/
    Workspace  SourcesPanel  ChatPanel  StudioPanel  NotesPanel  ModelPicker
    SearchView  LibraryModal  TransformationsModal
    ArtifactModal  SourceModal  DiscoverModal  BrowserModal  SourceUpdates
    MindMap  Quiz  Flashcards  Infographic  Metaphors
    PodcastPlayer  VideoPlayer  Markdown
  lib/
    db.ts        SQLite schema (node:sqlite, no native build step)
    ai.ts        model client (Azure OpenAI with Entra ID, or OpenAI-compatible): chat / JSON / embeddings / images / transcription
    providers.ts named provider presets (base URL, key variable, default models)
    sessions.ts  notes.ts  transformations.ts   chat sessions, notes, transformation prompts
    auth.ts      optional password: HMAC session token (Edge + Node); see src/middleware.ts
    settings.ts  runtime settings (active models) that override the environment
    infographic.ts  style registry: themes + per-style content guidance
    metaphors.ts vocabulary of visual metaphors for the illustrated style
    speech.ts    Azure Speech dialogue synthesis
    voices.ts    voice list shared by the API and the UI
    prosody.ts   pause shaping; documents which SSML tags measurably work
    websearch.ts pluggable search providers + reachability probing
    safefetch.ts SSRF-safe fetch: private-address refusal per redirect hop, size caps
    youtube.ts   transcript retrieval and URL parsing
    gemini.ts    YouTube transcripts via the supported video-input route
    ingest.ts    text extraction + chunking
    retrieve.ts  hybrid retrieval, corpus sampling, citation building
    studio.ts    per-format prompts and schemas
    refresh.ts   re-fetch, word-level change detection, bot-wall guard, re-indexing
    vision.ts    image description, with a guard against blind models inventing one
    whiteboard.ts scene planning for videos; videobuild.ts runs the pipeline
    paths.ts     data/audio, images, voices and video paths, traversal-safe resolution
    rangefile.ts byte-range file streaming for media routes
    http.ts  types.ts   JSON response helpers and shared types
scripts/
  check-ai.ts         live checks against the configured model provider
  check-ssrf.ts       offline tests for safefetch.ts
  whiteboard/render.py  Python renderer that composites and encodes whiteboard videos
```

**Storage note:** the database uses Node's built-in `node:sqlite` (Node 22.13+),
so there is no native compilation step. The handle is opened lazily on first query.

---

## Roadmap ideas

- Postgres + pgvector adapter for multi-user deployments
- Multi-user accounts and sharing (today: one optional shared password)
- Interface translations
- Per-source context modes (summary-only vs full text) in chat

## Contributing

The REST API is documented in [docs/API.md](docs/API.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and the checks to
run before a pull request. Report security issues privately as described in
[SECURITY.md](SECURITY.md).

Want to build something like this yourself? See the
[recreation prompt](docs/recreation-prompt.md), a beginner-level LLM prompt
for rebuilding InfiniAIBook.

## Licence

[MIT](LICENSE)
