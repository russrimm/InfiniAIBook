# Recreation prompt

This prompt asks an LLM coding assistant to rebuild InfiniAIBook from an empty
folder. It sets a role, gives the product context, lists the current features
and constraints, and defines the build order and the finish line.

It describes the app's current feature set. It hasn't been tested end to end,
so treat the output as a starting point rather than an exact copy of this
repository.

## The prompt

```text
You are a senior full-stack engineer. Build "InfiniAIBook", a self-hosted,
single-user research notebook, in an empty project folder.

Product context
Users upload or link their own sources, chat with them, and generate study and
media outputs from them. Every answer and generated item cites the source
passages it came from as numbered markers such as [1] [2]. Hovering or clicking a
citation shows the exact passage.

Requirements
- Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS, and SQLite through
  Node's built-in `node:sqlite` (Node 22.13+), so nothing needs compiling.
- Storage: all data lives under `.data/` (database, uploads, audio, images,
  video), or under `DATA_DIR` when it is set.
- Models: Azure OpenAI through `DefaultAzureCredential` (`az login`, no API key),
  or any OpenAI-compatible endpoint such as Ollama, LM Studio or llama.cpp when
  `AI_BASE_URL` is set. Model settings are optional except for one chat model.
- Configuration: document every setting in `.env.example` with a comment.
- Validate every AI-generated JSON response with zod before rendering it.

Features
1. Notebooks: list, create and delete. Deletes can be undone for 8 seconds.
2. Sources: upload PDF, DOCX, PPTX, TXT, MD, CSV, JSON, HTML, images (described by
   a vision model), audio and video (transcribed), and ZIP archives (import the
   supported files inside). Also accept pasted text, web URLs, YouTube links
   (transcripts via Gemini when a key is set) and RSS/Atom feeds. Process uploads
   in the background. Add "discover sources" (web search by topic, DuckDuckGo by
   default, or Tavily, Brave or Google with a key) and an in-app browser. Let
   users reuse a source from another notebook.
3. Grounded chat: streaming answers built only from the selected sources, with
   inline citations that open the highlighted passage, a Stop button that keeps
   the partial answer, and several chat sessions per notebook.
   - Split documents into about 1,400-character chunks with 200 characters of overlap.
   - Score results as 85% semantic similarity plus 15% keyword overlap, so exact names still surface.
   - Store the embedding model with each chunk. If it no longer matches the
     active model, rank that chunk by keyword only.
4. Notes: Markdown notes, saved chat answers (citations kept), notes converted
   into sources, and reusable prompts run against a source.
5. Search and Ask across every notebook, by keyword or meaning.
6. Studio generators. Each returns structured, validated JSON and renders as an
   interactive view, not plain text:
   - Written: report, briefing doc, study guide, FAQ and timeline.
   - Mind map: expandable and clickable.
   - Quiz: scored, retry only missed questions, cited explanations.
   - Flashcards: flip, self-grade, shuffle and browse.
   - Infographic: many styles, including a default Illustrated style and an
     AI-image style, plus a choice of landscape, portrait or square.
   - PowerPoint deck: title, agenda, content slides with speaker notes and a
     sources slide, downloadable as PPTX.
   - Audio overview: one to four speakers in a scripted podcast, narrated to MP3
     with Azure Speech, with a transcript that highlights during playback.
     Length is 3, 6 or 10 minutes.
   - Whiteboard video: about six narrated, hand-drawn scenes rendered to MP4
     with a Python script (numpy, Pillow, imageio-ffmpeg).
   - Motion explainer: a narrated 2D animated story (problem, solution, how it
     works, benefits, next step), rendered to MP4.
   - Training video: an editable trainer script, rendered with a lip-synced
     Azure AI Foundry avatar and timed slides, pictures and infographics.
   - Audio and all video formats stop at an editable script before any narration
     or rendering. They accept narration instructions, a word-replacement list,
     uploaded background music and a text or image watermark.
7. Live discussions: real-time voice conversations about the sources (discuss,
   debate, Q&A, expert interview, oral quiz, Socratic tutor). Users can interrupt,
   the model can look up sources mid-call, and the call can be saved as a note.
8. Structure explorer: open JSON, XML, CSV/TSV or HAR sources in a modal with a
   path tree or graph and a sortable table. HAR files also get a request table,
   waterfall, findings (failed requests, slow TTFB, uncached responses,
   redirects, secrets in URLs) and a "Diagnose with AI" action. That action sends
   a redacted digest, never the raw file.
9. Screen helper: the user shares a window, describes a goal, and gets coached one
   step at a time, with the next control highlighted on a screenshot.
10. Exports: Markdown, PPTX, MP3, MP4, PNG (infographics and mind maps), and CSV
    for flashcards that imports into Anki or Quizlet.
11. Change detection for linked web sources: check each source at most every six
    hours when the notebook opens. Show a banner with "Re-index" and "Keep
    current". Ignore formatting-only changes and bot-check pages. A real change
    must be at least 40 words and 1.5% of the page.
12. Model picker in the workspace header for chat, embedding, image and vision
    models. A saved choice overrides the environment until the user resets it.
13. Layout: sources on the left, chat in the middle, Studio on the right. Honor
    `prefers-reduced-motion`. Show render progress for video stages and a clear
    reason when a render fails.
14. Spend ceiling: estimate model, speech and image spend, and stop at $25 per UTC
    day when a cloud provider is configured. `DAILY_BUDGET_USD` changes the limit
    or turns it off.

Constraints
- Retry rate-limited calls with backoff. Show friendly messages instead of raw 401 or 404 errors.
- URL fetching must refuse localhost and private network addresses on every
  redirect hop. Enforce caps on size, redirects and timeout.
- No login by default, so bind to localhost. Support an optional
  `INFINIAIBOOK_PASSWORD`. The README must warn against exposing an
  unprotected instance.
- npm scripts: `lint`, `test`, `test:e2e`, `build`, `check:ai` (verifies the
  configured models), `check:ssrf`, `check:motion` and `check:training`.
- Docs: a README with setup steps, plus CONTRIBUTING.md, SECURITY.md, an MIT
  LICENSE and a Dockerfile.
- Use US English in UI copy, docs and comments.

Process
Build in this order and stop after each stage to show how to run and test it:
1. Project setup, configuration and database.
2. Sources and grounded chat.
3. Notes, search and Ask.
4. Written Studio formats, mind map, quiz and flashcards.
5. Infographics.
6. Audio and video formats.
7. Live discussions, screen helper and structure explorer.
8. Exports, change detection, model picker, spend ceiling and docs.

A stage is done only when `npm run lint`, `npm test` and `npm run build` pass
for the work so far. Explain briefly what you are changing and why.
```

## What the prompt leaves out

A prompt at this level won't reproduce the parts of InfiniAIBook that were
tuned by hand. To get closer to the current app, follow up with prompts that
cover these details, all covered in the [documentation](README.md):

- **Retrieval**: about 1,400-character chunks with 200 characters of overlap,
  and ranking that blends cosine similarity with lexical overlap at 85/15.
  Every chunk records which embedding model produced it, so stale vectors fall
  back to keyword-only ranking.
- **Change detection**: materiality is judged on words rather than lines. A
  change has to be at least 40 words *and* 1.5% of the page.   A short page (under 1,200 characters) with bot-check wording is treated as a
  bot wall, and a fetch that shrinks below 40% of the indexed size keeps the
  indexed copy. Checks are
  paced to once every six hours per source.
- **Model quirks**: reasoning deployments (gpt-5 and o-series) reject a custom
  `temperature`, and the app catches an `AZURE_OPENAI_API_VERSION` that is
  really a model version (see `src/lib/ai.ts`).
- **Speech**: uses the multi-speaker `en-Multitalker:DragonHDLatestNeural`
  voice and synthesizes turns in small batches, with timed transcript offsets.
  The script prompt forbids stage directions such as `[MUSIC]` so they're never
  read aloud (see `src/lib/studio.ts`).
- **URL fetching**: private addresses are refused on every redirect hop, not
  only for the first URL, and fetches have caps on size, redirects and timeout.
