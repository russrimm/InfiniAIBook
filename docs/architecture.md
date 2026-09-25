# Architecture

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
