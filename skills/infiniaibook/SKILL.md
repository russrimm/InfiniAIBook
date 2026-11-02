---
name: infiniaibook
description: Install, run, configure and script InfiniAIBook (formerly OpenNotebook), a self-hosted, open-source AI research notebook and NotebookLM alternative built on Next.js and SQLite. Use when the user wants to set it up or troubleshoot it, connect it to Azure OpenAI, Microsoft Foundry, OpenAI, Anthropic, Gemini, Ollama or another model provider, add sources to a notebook, ask questions with citations, or generate reports, slide decks, infographics, quizzes, mind maps, podcasts or videos from their own documents through its REST API.
license: MIT
compatibility: Needs Node.js 22.13 or later and a model endpoint. Optional - Python 3 for whiteboard and motion videos, Azure CLI for Entra sign-in, Docker.
metadata:
  repository: https://github.com/russrimm/InfiniAIBook
  docs: https://github.com/russrimm/InfiniAIBook/tree/main/docs
---

# InfiniAIBook

InfiniAIBook is a single-user research notebook that runs on the user's own
machine. They add sources (documents, web pages, YouTube, audio, video, decks),
chat with them, and every answer cites the passage it came from. The Studio
turns the same sources into 14 kinds of output: reports, briefings, study
guides, FAQs, quizzes, flashcards, mind maps, timelines, slide decks,
infographics (33 styles), audio overviews, whiteboard videos, motion explainers
and avatar training videos. Everything is also reachable through a JSON REST API.

## When to use this skill

Use it when the user wants to install, run, configure, troubleshoot, script or
extend InfiniAIBook. Do not use it for a hosted service (there is none), for
multi-user accounts (it has one optional shared password), or for Copilot Studio
agents, which are not model endpoints.

## Workflow

### 1. Find out what already exists

- A checkout exists when `package.json` has `"name": "infiniaibook"`.
- It is running when `GET http://localhost:3000/api/auth/status` returns
  `{ "auth": false }` or `{ "auth": true }`. If `true`, every other call needs a
  credential (see Security below).
- Ask which model endpoint the user has before changing any settings.

### 2. Install and run

```bash
git clone https://github.com/russrimm/InfiniAIBook.git
cd InfiniAIBook
npm install
cp .env.example .env.local      # Windows PowerShell: Copy-Item .env.example .env.local
# edit .env.local: choose a provider (step 3)
npm run check:ai                # optional: PASS or FAIL for each model
npm run dev                     # http://localhost:3000, loopback only
```

Settings are read only at start, so restart after editing `.env.local`. For a
production build use `npm run build` then `npm start`. For Docker use
`docker compose up -d --build`. Details: `references/setup.md`.

### 3. Connect a model

Only a **chat** model is required. Embeddings, images, voices, transcription and
realtime are optional and each switches on its own features. Set `AI_PROVIDER`
and that provider's key in `.env.local`:

| Provider | Settings |
|---|---|
| OpenAI | `AI_PROVIDER=openai`, `OPENAI_API_KEY` |
| Anthropic | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` (add an embedding provider for semantic retrieval) |
| Gemini | `AI_PROVIDER=gemini`, `GEMINI_API_KEY` |
| Ollama (local) | `AI_PROVIDER=ollama`, no key |
| Azure OpenAI or Microsoft Foundry | `AI_PROVIDER=azure`, endpoint, deployment names, then `az login` or `AZURE_OPENAI_API_KEY` |

The full list (Groq, Mistral, DeepSeek, OpenRouter, xAI, Perplexity, Together,
LM Studio, llama.cpp, any OpenAI-compatible URL) and the Azure settings are in
`references/setup.md`.

### 4. Use it through the API

Typical sequence, with `B=http://localhost:3000`:

1. `POST $B/api/notebooks` `{ "title": "..." }` returns the notebook and its `id`.
2. `POST $B/api/notebooks/{id}/sources` adds a source: `{ "url": "..." }`,
   `{ "text": "...", "title": "..." }` or multipart `files`.
3. `POST $B/api/chat` `{ "notebookId", "message" }` streams newline-delimited
   JSON; the `delta` events are the answer and `done.citations` lists the cited
   passages.
4. `POST $B/api/generate` `{ "notebookId", "type": "report" }` creates a Studio
   artifact. `type` is one of `report`, `briefing`, `study_guide`, `faq`, `quiz`,
   `flashcards`, `mindmap`, `timeline`, `slides`, `infographic`.
5. `GET $B/api/notebooks/{id}/export` downloads a zip of everything.

Podcasts and the three video formats are two steps (write a script, then
narrate or render) and need Azure Speech. Request bodies, response shapes and
curl examples are in `references/api.md`, and the complete route list is in
`docs/API.md`.

## Guardrails

- **Never print, log or commit secrets.** Keys live in `.env.local`, which is
  gitignored. Do not paste one into chat, a script or an issue. Ask the user to
  set it themselves, or read it from the environment.
- **Keep it on loopback.** `npm run dev` and `npm start` listen on `127.0.0.1`.
  Before `npm run dev:lan` or `npm run start:lan`, set `INFINIAIBOOK_PASSWORD`.
  Scripts then send `Authorization: Bearer <INFINIAIBOOK_API_TOKEN>`.
- **Slow routes can fail inside a 200.** Generation, podcast, video, motion,
  training and diagnose requests that run longer than about five seconds return
  `200` right away and send spaces until the result is ready. Parse the whole
  body and check for an `error` field before using it.
- **Generation spends the user's model quota.** Confirm before looping over many
  sources or notebooks. `GET /api/budget` shows today's spend against the
  `DAILY_BUDGET_USD` ceiling.
- **Protect the data.** Notebooks live in `DATA_DIR` (default `./.data`). Never
  delete or move it without a backup (`GET /api/notebooks/{id}/export`). A copy of
  the project started from another folder reads that folder's own `.data`.
- **Stay grounded.** Answers are only as good as the selected sources. Pass
  `sourceIds` to limit grounding, and never pass an empty list: it is refused
  with `400 no_sources`.

## When something fails

Read `references/troubleshooting.md` first. The most common causes are Node
older than 22.13, a misnamed `.env.local`, a deployment name that does not match
the provider, a port already in use, and a different `DATA_DIR`.

## Learn more

- Docs index: https://github.com/russrimm/InfiniAIBook/tree/main/docs
- Walkthrough with screenshots: https://www.russrimmerman.com/blog/open-notebook-self-hosted-research-notebook/
- Beginner install guide: `docs/install-guide.md`
- Security model: `SECURITY.md`
