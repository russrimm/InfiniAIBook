# Product

<!-- impeccable:product-schema 1 -->

> **Status: inferred, not yet confirmed.** This file was written from repository evidence (README, `docs/`, `SECURITY.md`, `src/`) while the owner was unavailable. Facts marked _(inferred)_ need confirmation; everything else is stated directly in the repository.

## Platform

web

## Users

- **Primary:** one person who self-hosts the app and is its only user. They collect sources on a topic, question those sources, and turn them into finished material they can trust and reuse. ("Single-user" is stated in the README and SECURITY.md.)
- The samples and default integrations center on Microsoft and Azure: Copilot Studio source notebooks, Azure OpenAI, Azure Speech, Azure AI Foundry avatars, and Entra ID. This suggests a technical professional producing research, briefings, and enablement or training content for other people _(inferred)_.
- A secondary use is self-study: quizzes, flashcards, study guides, and oral quiz or Socratic tutor discussions _(inferred)_.

## Product Purpose

InfiniAIBook is a self-hosted research studio. Users upload their own sources, chat with them, and turn them into reports, briefings, PowerPoint decks, infographics, mind maps, quizzes, flashcards, study guides, FAQs, timelines, audio overviews, whiteboard and motion explainer videos, and avatar training videos. Every claim is cited back to the document it came from.

Success means the user ends up with output they can use or share without re-checking it against the originals: grounded, cited, editable, and exportable (Markdown, PPTX, MP3, MP4, PNG, Anki/Quizlet CSV).

## Positioning

- **Grounded only in the sources you select.** Chat and Studio refuse to answer when no source is selected. They don't fall back to the model's general knowledge or to all sources. Citations resolve to the source title, part, and raw excerpt.
- **Self-hosted and provider-agnostic.** All data lives under `.data/` on the user's machine. The app runs against Azure OpenAI, about a dozen named providers, or any OpenAI-compatible endpoint, including fully local models (Ollama, llama.cpp, LM Studio).
- **A script you review before anything is rendered.** Audio and all video formats stop at an editable script, with narration instructions and word replacements, before narration or rendering begins.
- Inspired by open-notebook, and offered as a self-hosted alternative to hosted notebook research tools _(inferred)_.

## Operating Context

- Runs locally (`npm run dev`, Docker) and listens on localhost by default. LAN use requires `INFINIAIBOOK_PASSWORD` or an authenticating proxy.
- Workspace structure: notebook list → notebook workspace (Sources, Chat, Studio, Notes panels) → cross-notebook Search/Ask.
- Long-running jobs (ingesting sources, rendering audio and video) run in the background while the user keeps working.
- Live discussions are realtime voice conversations with interruption. The screen helper coaches the user through another app's shared window.
- Users typically work in long sessions alongside other tools, such as docs, PowerPoint, and LMS or Anki imports _(inferred)_.

## Capabilities and Constraints

- Stack: Next.js 15, TypeScript, Tailwind, SQLite (`node:sqlite`), and Node 22.13+.
- Only a chat model is required. The embedding, image, vision, transcription, and Azure Speech models each switch on extra features, and the UI must degrade gracefully when one is missing. For example, retrieval falls back to keyword search alone.
- Studio output is structured JSON, validated and normalized, so a malformed model response can never break the UI.
- Sources: PDF, DOCX, TXT, MD, CSV, JSON, HTML, images, audio/video, pasted text, URLs, YouTube, RSS/Atom, web discovery, and an in-app browser. Linked sources are re-checked for changes.
- Infographics come in 20 named styles. Videos render to MP4 and can take minutes.
- Terminology: _notebook_, _source_, _Studio_, _artifact_, _transformation_, _note_, _session_, _audio overview_, _whiteboard video_, _motion explainer_, _training video_, _live discussion_, _screen helper_.
- Undecided: whether multi-user or hosted use is ever in scope. The current design is explicitly single-user.

## Brand Commitments

- Name: **InfiniAIBook**. Tagline in metadata: "grounded research studio."
- Language: US English in UI copy, docs, and generated content (owner preference).
- Voice in the docs is plain, precise, and candid about limits and costs. For example, the docs explain why a fallback exists and what it costs _(inferred from docs)_.
- No logo or brand asset beyond the name and favicon was found.

## Evidence on Hand

- Screenshots: `docs/screenshots/*.png` (workspace, infographic, mind map, notes, search, transformations, and training card/editor).
- Infographic style samples: `docs/infographics/*.png` (20 styles).
- A sample avatar training video (3:37, from two public Copilot Studio pages), linked from the README.
- Feature docs in `docs/`.
- **Absent, so don't fabricate:** testimonials, customer names, usage numbers, benchmarks, press, pricing, or hosted/SaaS claims. The app is MIT-licensed open source.

## Product Principles

1. **Grounded or silent.** Never present a claim the selected sources can't support, and always show where it came from.
2. **The user's data stays with the user.** Local storage, any provider, local models welcome.
3. **Review before render.** Expensive or public-facing output (narration, video) passes through an editable script first.
4. **Degrade, don't break.** Missing models, malformed responses, and stale embeddings produce an explanation and a fallback, not a failure.
5. **Finished output, not raw text.** Every Studio format is a structured, interactive artifact that can be exported to the tool where it will actually be used.

## Accessibility & Inclusion

No product-specific standard has been established _(open decision)_. Existing commitments: audio overviews have synced transcripts, videos have burned-in subtitles, and retrieval handles Unicode and non-Latin text.
