# InfiniAIBook

A self-hosted Agentic Powered Notebook research studio. Upload your own sources, chat with
them, and turn them into **reports, briefings, infographics, mind maps, quizzes,
study guides, FAQs and timelines** — every claim cited back to the document it came from.

Built with Next.js 15, TypeScript and SQLite. Runs against Azure OpenAI, a dozen
named providers (OpenAI, Anthropic, Gemini, Groq, Mistral, DeepSeek, OpenRouter,
xAI, Perplexity, Together) or any OpenAI-compatible endpoint, including local
models via Ollama, llama.cpp or LM Studio.

Inspired by [open-notebook](https://github.com/lfnovo/open-notebook).

> **Single-user.** Without `INFINIAIBOOK_PASSWORD`, anyone who can reach the
> server can use it, and your model quota with it. Run it on localhost, set a
> password, or put it behind an authenticating proxy — see [SECURITY.md](SECURITY.md).

![InfiniAIBook workspace with four selected sources, a chat session picker, a cited chat answer and Studio generation tools including a multi-speaker audio overview](docs/screenshots/workspace.png)

More in the [screenshot tour](docs/screenshots.md).

## Features

- **Sources** — PDF, DOCX, TXT, MD, CSV, JSON, HTML, images, audio/video, pasted
  text, URLs, YouTube links and RSS/Atom feeds; discover sources from a topic or
  browse the web in-app. Linked sources are re-checked for changes.
  [More](docs/sources.md)
- **Grounded chat** — streaming answers built only from your selected sources,
  with inline citations and multiple chat sessions per notebook.
- **Notes and transformations** — Markdown notes, saved chat answers and
  reusable prompts run on a source. [More](docs/notes-and-search.md)
- **Search everything** — keyword or semantic search, and a grounded **Ask**,
  across every notebook. [More](docs/notes-and-search.md#search-and-ask)
- **Studio** — eleven generators, each producing a structured, interactive artifact:

  | Format | Output |
  |---|---|
  | 🎧 [Audio overview](docs/audio-overviews.md) | One to four speakers discuss your sources, with a synced transcript |
  | 🎬 [Whiteboard video](docs/whiteboard-videos.md) | A narrated, hand-drawn explainer, MP4 |
  | 📊 [Infographic](docs/infographics.md) | Headline stats and themed sections in **20 styles** |
  | 🕸️ [Mind map](docs/studio.md#mind-maps) | Interactive, expandable concept tree |
  | 🧠 [Quiz](docs/studio.md#quiz) · 🗂️ [Flashcards](docs/studio.md#flashcards) | Scored quizzes and self-graded decks |
  | 📄 Report · 🧾 Briefing · 🎓 Study guide · ❓ FAQ · 🗓️ Timeline | Structured written summaries |

- **Exports** — Markdown, MP3, PNG and Anki/Quizlet CSV. [More](docs/studio.md#exporting)
- **Everything is local** — sources, embeddings, chat history, artifacts and
  media live under `.data/`. Password protection and a Docker image included.

See the [full feature list](docs/features.md) for details.

## Quick start

Requires **Node.js 22.13+** and a model provider.

```bash
npm install
cp .env.example .env.local   # then configure a provider
npm run dev
```

Open <http://localhost:3000>. See [Getting started](docs/getting-started.md) for
Docker and password protection, and [Configuration](docs/configuration.md) for
providers and environment variables.

## Documentation

Full documentation is in [docs/](docs/README.md), including
[how grounding works](docs/grounding.md), the [architecture](docs/architecture.md)
and the [REST API](docs/API.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and the checks to
run before a pull request. Report security issues privately as described in
[SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE)
