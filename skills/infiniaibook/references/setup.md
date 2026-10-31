# Setup reference

Everything here is checked against the project's own docs: `docs/getting-started.md`,
`docs/configuration.md` and `docs/install-guide.md`. Prefer those when they differ.

## Requirements

- Node.js **22.13 or later**. The database uses the built-in `node:sqlite`.
- One model endpoint with a **chat** model. Everything else is optional.
- Optional: Python 3 with `numpy`, `Pillow` and `imageio-ffmpeg` (whiteboard and
  motion videos), the Azure CLI (Entra sign-in), Docker.

## Install and run

```bash
git clone https://github.com/russrimm/InfiniAIBook.git
cd InfiniAIBook
npm install
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local
npm run check:ai                  # PASS or FAIL per model, after .env.local is set
npm run dev                       # http://localhost:3000
```

- `npm run dev` and `npm start` listen on `127.0.0.1` only.
- Settings are read once at start. Restart after any `.env.local` change.
- Production: `npm run build`, then `npm start`.
- Docker: `cp .env.example .env.local`, set a provider, `docker compose up -d --build`.
  Data lives in the `infiniaibook-data` volume. Use API keys or a service
  principal inside a container, not `az login`. Whiteboard, motion and composed
  training videos need `--build-arg WITH_PYTHON=true`.

## Pick a provider

Set `AI_PROVIDER` plus that provider's key in `.env.local`. The base URL and
default models are filled in. Override the model with `AI_MODEL`.

| `AI_PROVIDER` | Key variable | Default chat model | Embeddings | Transcription |
|---|---|---|---|---|
| `openai` | `OPENAI_API_KEY` | gpt-4o-mini | text-embedding-3-small | whisper-1 |
| `anthropic` | `ANTHROPIC_API_KEY` | claude-sonnet-4-5 | none | none |
| `gemini` | `GEMINI_API_KEY` | gemini-2.5-flash | gemini-embedding-001 | none |
| `groq` | `GROQ_API_KEY` | llama-3.3-70b-versatile | none | whisper-large-v3 |
| `mistral` | `MISTRAL_API_KEY` | mistral-small-latest | mistral-embed | none |
| `deepseek` | `DEEPSEEK_API_KEY` | deepseek-chat | none | none |
| `openrouter` | `OPENROUTER_API_KEY` | openai/gpt-4o-mini | none | none |
| `xai` | `XAI_API_KEY` | grok-3-mini | none | none |
| `perplexity` | `PERPLEXITY_API_KEY` | sonar | none | none |
| `together` | `TOGETHER_API_KEY` | Llama-3.3-70B-Instruct-Turbo | bge-large-en-v1.5 | none |
| `ollama` | none (local) | qwen3.5:latest | nomic-embed-text | none |
| `lmstudio`, `llamacpp` | none (local) | set `AI_MODEL` | set `AI_EMBEDDING_MODEL` | none |
| `azure` | Entra ID or `AZURE_OPENAI_API_KEY` | your deployment | your deployment | your deployment |

A chat-only provider (such as Anthropic) can borrow embeddings and transcription
from another one:

```ini
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
AI_EMBEDDING_PROVIDER=openai
AI_TRANSCRIPTION_PROVIDER=groq
```

Without an embedding endpoint the app still works and ranks by keyword, and it
says so.

Any OpenAI-compatible server (llama.cpp `llama-server`, vLLM, Ollama at
`:11434/v1`, LM Studio at `:1234/v1`) works with `AI_BASE_URL`, `AI_MODEL`,
`AI_EMBEDDING_MODEL` and, if it needs one, `AI_API_KEY`. A base URL takes
precedence over Azure. Without a GPU, local models are slow: expect minutes for
one short source.

## Azure OpenAI or Microsoft Foundry

Used when neither `AI_PROVIDER` nor `AI_BASE_URL` is set, or with `AI_PROVIDER=azure`.

```ini
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_DEPLOYMENT=<chat deployment name>
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=<embedding deployment name>
```

- Values are **deployment names**, not model names. List them with
  `az cognitiveservices account deployment list -n <resource> -g <rg> -o table`.
- `AZURE_OPENAI_API_VERSION` is a dated API release such as `2024-10-21`, never a
  model version.
- Sign-in has no key by default: run `az login`. The account needs the
  **Cognitive Services OpenAI User** role on the resource. `AZURE_OPENAI_API_KEY`
  is accepted and takes precedence over Entra when set.
- On Azure, enable a managed identity and give it the same role. For a
  user-assigned identity set `AZURE_CLIENT_ID`. Off Azure, a service principal
  needs `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`.
- With several tenants, set `AZURE_TENANT_ID` alone to sign in to the resource's
  tenant. The signed-in account must hold the role there. If a different account
  holds it, run `az account set --subscription <id>`.
- Optional deployments: `AZURE_OPENAI_IMAGE_DEPLOYMENT` (image infographics,
  whiteboard and motion videos), `AZURE_OPENAI_VISION_DEPLOYMENT`,
  `AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT`, `AZURE_OPENAI_REALTIME_DEPLOYMENT`.
- Voices, podcasts, video narration and avatars use Azure AI Speech:
  `AZURE_SPEECH_REGION` plus `AZURE_SPEECH_RESOURCE_ID` (or `AZURE_SPEECH_KEY`).

## Which model switches on what

| Model | Without it |
|---|---|
| Chat (required) | Nothing works |
| Studio script (`AI_STUDIO_MODEL`) | The chat model writes scripts and plans |
| Embeddings | Keyword ranking instead of semantic retrieval |
| Image | AI-image infographics, whiteboard and motion videos fail |
| Vision | The chat model reads images, so it must support them |
| Transcription | Audio and video uploads fail with a message naming what to set |
| Realtime voice | The Live discussion card explains what to set |
| Azure Speech | No audio overviews, narration or avatars |
| Gemini key | YouTube transcripts fall back to captions or the description |

## Security settings

| Variable | Effect |
|---|---|
| `INFINIAIBOOK_PASSWORD` | Requires a password for the UI and API |
| `INFINIAIBOOK_API_TOKEN` | Bearer token for scripts. Once set, the password stops working as one |
| `ALLOWED_HOSTS` | Extra hostnames the server answers to, comma-separated |
| `TRUST_PROXY=true` | Honor forwarded host headers behind a reverse proxy |
| `ALLOW_PRIVATE_NETWORK_FETCH` | Allows fetching private addresses. Leave it off |
| `DAILY_BUDGET_USD` | Daily model spend ceiling for cloud providers |

To use it from another device, set a password first, then run
`npm run dev:lan` or `npm run start:lan`. See `SECURITY.md`.

## Data

- Everything lives in `DATA_DIR` (default `./.data` inside the project).
- A project started from another folder reads that folder's own `.data`.
- On a network share such as Azure Files set `SQLITE_JOURNAL_MODE=DELETE`.
- Back up one notebook with `GET /api/notebooks/{id}/export`; restore it with
  `POST /api/notebooks/import`.
- An old `.data/opennotebook.db` is renamed to `infiniaibook.db` on first start.

## Updating

Pull the latest code, run `npm install`, and restart. Check `npm run check:ai`
if the provider or models changed. If the embedding model changed, repair each
notebook with `POST /api/notebooks/{id}/reembed`.
