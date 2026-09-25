# InfiniAIBook documentation

**Setup**

- [Getting started](getting-started.md) — prerequisites, local install, Docker
  and password protection
- [Configuration](configuration.md) — model providers, custom endpoints,
  environment variables, Entra ID sign-in, reasoning models and rate limits

**Using the app**

- [Features](features.md) — everything the app does, and every Studio format
- [Screenshots](screenshots.md) — a tour of the workspace
- [Sources](sources.md) — uploading, discovering and browsing sources, images,
  YouTube transcripts, and keeping linked sources current
- [Notes, sessions and search](notes-and-search.md) — chat sessions, notes,
  transformations, cross-notebook search and source reuse
- [Infographic styles](infographics.md) — all 20 styles, with a gallery
- [Audio overviews](audio-overviews.md) — multi-speaker podcasts, voices and pacing
- [Whiteboard videos](whiteboard-videos.md) — narrated, hand-drawn explainer videos
- [Study aids, mind maps and exporting](studio.md) — quizzes, flashcards, mind
  maps and export formats

**Internals**

- [How grounding works](grounding.md) — chunking, retrieval, citations and
  changing the embedding model
- [Architecture](architecture.md) — source layout and storage
- [REST API](API.md)
- [Recreation prompt](recreation-prompt.md) — a beginner-level LLM prompt for
  building something like InfiniAIBook yourself

## Roadmap ideas

- Postgres + pgvector adapter for multi-user deployments
- Multi-user accounts and sharing (today: one optional shared password)
- Interface translations
- Per-source context modes (summary-only vs full text) in chat
