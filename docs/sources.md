# Sources

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
