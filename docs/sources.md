# Sources

## Viewing sources and synopses

Open **Sources (count)** in the notebook header to see every added source and
its full synopsis in the pop-out Sources panel. Upload tools start folded in
this view so the list has room. Click a source to read its content, or use its
checkbox to choose whether Chat and Studio use it. **Pin** keeps the panel open
while you work elsewhere; the close button or Escape collapses an unpinned
panel.

Inside the reader, **Find** searches the source's text: matches are highlighted, the first is scrolled into view, and Enter or the up and down buttons step to the next or previous one (Shift+Enter goes back). The count shows `2 of 12` (`500+` once a search matches more than 500 places). The first Escape clears the search; the next closes the reader.

**Add sources** in the header opens the same panel with upload tools expanded.
You can also expand or hide those tools inside the panel without losing an
unfinished link or pasted-text draft. On narrow screens, the **Sources** tab
opens the list when sources exist. A source without a saved summary explicitly
shows **No synopsis available**; viewing the list does not generate another
summary or re-import the source.

**Rename** (the pencil on a row) changes only the source's name. Its text, passages and embeddings are untouched, so nothing needs re-indexing; Enter saves and Escape cancels. A name like "Untitled" or a long page title is easy to fix this way, and the new name appears in citations and exports from then on. Once a notebook has six or more sources, a **Filter sources** box at the top of the list narrows it by name or synopsis. The filter only hides rows: hidden sources keep their ticks, so Chat and Studio still use whatever is ticked.

### Tags (folders) and bulk actions

A **tag** is a label that groups sources, and works as a folder: give related
sources the same tag ("Interviews", "2024 filings") and show only that group.
A source can carry up to 8 tags (32 characters each, case ignored), so it can sit
in several groups at once.

- **Tag one source:** the **#** button on a row opens its tags as a comma-separated
  list. Enter or **Save tags** keeps them, Escape cancels.
- **Filter by tag:** once any source has a tag, a row of tag buttons appears above
  the list with how many sources carry each. Click one to show only those; click it
  again or **All** to show everything. Clicking a tag on a row does the same. A tag
  filter, like the text filter, only hides rows and never changes what is ticked.
- **Select by filter:** while a filter or tag is showing, **Tick these** adds the
  showing sources to the ticked ones and **Only these** ticks exactly them. That is how
  you make Chat and Studio use one group.
- **Manage** (next to *Select all*) opens a bar that acts on the sources that are
  both ticked and showing:
  - **Add tag** and **Remove tag** change many sources at once. The result says how many
    changed ("Tagged 12 sources “Papers”") and **Undo** puts every tag back as it was.
    A source that already has 8 tags is skipped and the message says so.
  - **Delete…** asks first, then removes them all. One **Undo** (for a few seconds)
    brings every one back, like deleting a single source.

Tags are stored with the source and travel in notebook exports and imports. Notebooks
and exports made before tags existed work unchanged.

## Adding sources

Open **Add sources** in the notebook header. Use **Drop files or click to
upload**, **Add link**, **Paste text**, **Search web**, **Browse web**,
**Microsoft Learn** or **From other notebooks**. Files can be dropped anywhere
on the notebook, not only on the upload area: a cue appears while you drag,
and the Sources panel opens to show progress. (While a dialog is open a drop
is ignored, so nothing is added behind it.) Drop image files or use a direct
image link. Other plain-text and code files can
also be dropped. JSON (including JSONL/GeoJSON), HAR, XML-family files
(GPX/KML, SVG, RSS/Atom, XSD and XHTML) and CSV/TSV sources offer
**Explore structure** in their reader; see the
[feature list](features.md).

**Audio and video files** (MP3, M4A, WAV, OGG, FLAC, WebM, MP4, up to 25 MB)
and direct links to them are transcribed with the configured speech-to-text
model (`whisper-1` on OpenAI, `whisper-large-v3` on Groq, or an Azure
transcription deployment) and indexed like any other text.

**PowerPoint decks** (.pptx) are read slide by slide in presentation order:
each slide's title, text and table rows, followed by its speaker notes, under a
`Slide N` heading so answers can point at the slide. Text that exists only
inside pictures is not read. Protected decks (sensitivity labels, IRM,
passwords) and legacy .ppt files renamed to .pptx are refused with a message
saying what to do.

**EPUB books** (.epub) are read chapter by chapter in reading order, under the
book's title and author. Headings and paragraphs keep their breaks, and the table
of contents is left out. The file is only read in memory: it is refused if it is not
a real EPUB, lists more than 5,000 files, or is DRM-protected (fonts are fine), a
chapter over 10 MB is skipped, and at most 5 million characters of text are kept,
with a note saying which chapters were left out. A book made only of page images
(a scanned or comic EPUB) has no text to read and is refused with a message.

**Google Docs, Sheets and Slides** are added by pasting their link into **Add link**,
when the document is shared with **Anyone with the link**. The app asks Google for the
document's text export through the same guarded fetch as any other link: a Doc or Slides
deck becomes plain text and a Sheet becomes the CSV of the tab the link points at (the
`#gid=` part). No sign-in, key or Google account is involved, so a private document
cannot be read: the message says to set General access to Anyone with the link, or to
download or paste it instead. "Published to the web" links are ordinary pages and work
as any link does. Linked sources can be checked for changes like other URLs.

**Scanned PDFs** (pictures of pages with no text layer) are not read: the app does not
run OCR on PDFs. It says so, and how to fix it (make a searchable PDF with Google Drive,
Acrobat or your scanner app, or add photos of the pages as images, which the vision model
reads). OCR was not added because it would need either a native rendering library or a
model call per page whose cost the budget cannot yet estimate for images.

**ZIP archives** are unpacked on the server and every supported file inside
(PDF, DOCX, PPTX, EPUB, text, Markdown, CSV, JSON, HTML, images, audio and video)
becomes its own source, titled with its path in the archive. Archives nested
inside the ZIP are opened too, up to three levels. Other files are skipped and
listed in a warning, and OS clutter such as `__MACOSX/`, dotfiles and
`Thumbs.db` is ignored silently. A file that fails is reported on its own while
the rest still import. Files are processed one after another, so a large
archive can take a while. To guard against archives that expand enormously,
each file inside is held to `MAX_UPLOAD_BYTES`, at most `MAX_ARCHIVE_FILES`
(default 100) are imported, and the whole archive may expand to at most
`MAX_ARCHIVE_EXPANDED_BYTES` (default 500 MB); decompression stops as soon as a
limit is passed. Password-protected ZIPs are not supported.

Ingestion is **non-blocking**. Each source is sent as its own request and shows
a spinner in the Sources list while it is extracted, chunked and embedded.
Three run at a time; the rest show as "Queued" so a large drop does not flood
the model provider with embedding calls. The two-sentence summary is written
just after the source lands and appears a few seconds later. You can keep
dropping files, pasting links or running a discovery search while earlier items
are still processing; a failure affects only its own row, which explains what
happened and offers **Retry** (sends the same file, link or text again, so a
dropped connection or rate limit does not mean starting over) or dismissal.
Sources join the chat context automatically as
they land.

Files over 50 MB (`MAX_UPLOAD_BYTES`) are refused before they are sent, except
PowerPoint decks: the browser reads their slide text and speaker notes itself and
sends only that text (images and video are skipped, and a notice says so). A
source and all of its chunks are written in one transaction, so an interrupted
upload never leaves a half-indexed source behind.

### Discover (🔎 Search web)

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

### Microsoft Learn: imports and live chat

Open **Sources → Microsoft Learn** to search official documentation through the
public Microsoft Learn MCP server and Learn's site search. No additional API key
is needed. The app server needs outbound HTTPS access to
`https://learn.microsoft.com/api/mcp` and `https://learn.microsoft.com/api/search`.

**Find pages.** A search lists distinct *pages*, not passages: pages are matched
across locales, fragments and trailing slashes, so each appears once. The first
search blends Learn's paged site search with MCP passage searches for your
topic and, for short topics (three words or fewer), a few complementary angles
(overview, get started, tutorial, how to, concepts). Pages several searches
agree on rank first. A broad query such as "Copilot Studio" lists about 50
pages at once, grouped by type (Documentation, Training, Videos,
Certifications). The count shows how many pages were found; **Load more
results** pages further through the site search until the cap
(`LEARN_MAX_RESULTS`, default 100 site-search pages). Use **Filter these
results** and the type buttons to narrow the list, and **Select all** /
**Clear selection** to act on the pages currently shown. If some searches fail
or are slow, the rest still appear with a notice.

**Import pages.** Search a topic, review the results, and choose **Add sources**.
The app fetches each selected page's full documentation, not just its search
excerpt, and sends it through the normal source queue. Imported pages are saved
URL sources: select them for chat, Studio, and other notebook tools. Pages
already imported into that notebook are marked, and duplicate imports are
refused. Linked-source change checks apply as they do to other saved URLs.

**Connect live chat.** Turn on **Use live Microsoft Learn in chat** in the same
dialog. This setting is saved separately for each notebook and is off by
default. Each new chat question searches Learn for fresh passages alongside
only the saved sources you have selected. Live chat also works when no saved
sources are selected; it never includes unselected saved documents.

Live results do **not** create notebook sources. Their numbered citations open
the exact excerpt saved with the answer, plus a link to the original page.
Historical excerpts remain available after the page changes and survive chat
history, notes, and notebook export/import. The live setting also travels with
an export; older exports default to off.

Live retrieval applies only to notebook chat, not Studio, live discussion, or
library-wide Search/Ask. Import pages explicitly to use them in those tools.
Turning live mode off restores normal saved-source-only chat. If Learn is
unavailable, chat shows an explicit error instead of silently omitting the
connection. If Learn has no matches, chat can still use selected saved sources
with a notice; without those sources, it asks for a more specific question.

### Built-in browser (🌐 Browse web)

An address bar with **Go**, **Back**, the page, and **Add to sources**. It tells
you when a page is already a source in this notebook; **Add again** explicitly
creates another saved copy rather than updating the existing one.

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

For anything genuinely blocked, open the page and use **Paste text**.

No API key is needed — discovery searches Bing's public RSS search feed first.
Public endpoints may block automated requests on some networks. To enable API
fallbacks, set any of
`TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, or `GOOGLE_SEARCH_API_KEY` +
`GOOGLE_SEARCH_CX` on the app server, then restart or redeploy. Configured API
providers are tried in that order if Bing fails or returns no usable results.
A provider outage shows an actionable
error; a successful search with no matches suggests trying different wording.

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
Gemini route below uses a separate key, and **Paste text** lets you add a transcript
as text without either key.

YouTube is a rich source of learning material. Bring transcripts from multiple
videos into one notebook to build material for an audiobook or generate FAQs,
learning guides and infographics grounded in those videos.

Paste a YouTube URL into **Add link**. `watch?v=`, `youtu.be`, `/shorts/` and
`/embed/` forms are all recognized.

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
  substantial, clearly labeled `(description only)` with an in-text note and a
  warning in the Sources panel — you are never led to believe you got a
  transcript. Descriptions under 200 characters are rejected instead.
- `YOUTUBE_COOKIE` (the `Cookie` header from a signed-in session) is used when
  set, for networks where that is sufficient.
- When Gemini was tried and failed, the reason it gave is passed through, since
  "private, unlisted or age-restricted" is actionable and "blocked" is not.

For a guaranteed full transcript with no external service, **Paste text** still adds
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
