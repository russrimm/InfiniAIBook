# Lingua

A realtime voice tutor. You have a spoken conversation with a partner who
sounds and behaves like a real person. They answer as soon as you finish, you
can interrupt them, and they switch to your own language when you need it.

Lingua is a standalone app inside the InfiniAIBook repository. It has its own
dependencies and runs on its own port (3100). It shares no code with
InfiniAIBook.

## What it does

- **Voice conversations** over WebRTC with an Azure OpenAI `gpt-realtime` model.
  Speech goes in and speech comes out directly. Semantic voice activity
  detection lets you pause to think, and you can cut in mid-sentence.
- **Partners with a life of their own.** 22 characters, two per language, each
  with a home city, a job, interests, a way of talking and their own voice. The
  portraits are drawn in SVG, and the mouth and a ring around the portrait move
  with the partner's voice.
- **Ten situations.** Free conversation, ordering at a café, airport check-in,
  hotel front desk, asking for directions, seeing a doctor, shopping at a market,
  a job interview, rescheduling by phone, and dinner with friends. Each has goals
  that tick off as you reach them.
- **CEFR levels A1–C2.** Your level sets how much of the target language the
  partner uses, how fast they speak, and how long they wait before helping.
- **Gentle corrections.** The partner mostly corrects by naturally repeating what
  you said the right way. Each mistake also appears as a card under your line,
  with an explanation in your own language.
- **Live bilingual transcript.** Your words are transcribed as you speak, and
  each of the partner's lines is translated into your language. Translations
  can be turned off.
- **Recap and history.** When you hang up you get a summary: what went well, what
  to fix, words to keep, next steps, an estimated level, and how much of what you
  said was in the target language. Every call is saved, with its transcript.

### Languages

English, Spanish, French, German, Italian, Portuguese, Japanese, Mandarin
Chinese, Korean, Hindi and Arabic. Arabic is shown right to left. Any language
can be the one you practice or the one you get help in.

To add a language, add one entry to
[`src/lib/languages.ts`](src/lib/languages.ts) and at least one partner to
[`src/lib/personas.ts`](src/lib/personas.ts).

## How language switching works

Three mechanisms decide which language the partner speaks
([`src/lib/policy.ts`](src/lib/policy.ts)):

1. **Gradual immersion.** Your level sets the baseline. At A1 the partner talks
   mostly in your language and teaches short phrases. At C2 they never leave
   the target language unless you ask.
2. **Automatic help.** Each of your turns is scored. These raise a help level
   from 0 to 3:
   - answering in your own language (above A1)
   - phrases like "no entiendo" or "what does that mean"
   - a long silence
   - two or more mistakes in one turn

   As the level rises, the partner simplifies, then explains, then switches
   languages to reassure you. Two clean turns in a row lower the level by one
   step. Long silences also get a gentle check-in, the way a person would.
3. **On demand.** Say "in English, please" (in either language), or use the
   buttons: *Explain in [your language]*, *Repeat*, *Give me a hint*,
   *Slower*. *Only [target language]* turns on full immersion.

The partner calls a `set_language_mode` function whenever it switches, so the
transcript can show a note about the switch, for example "Switched to English ·
learner asked". Corrections, new words and goals reach the page the same way,
through function calls.

## Setup

Requirements:

- Node.js 22.13 or later.
- A realtime model deployment (`gpt-realtime`, `gpt-realtime-2.1`,
  `gpt-realtime-mini`, …) in a region that offers it. Global deployments are
  available in East US 2 and Sweden Central.

```bash
cd apps/lingua
npm install
cp .env.example .env.local   # then edit it
npm run dev                  # http://localhost:3100
```

Lingua reads only `apps/lingua/.env.local`. It does not read InfiniAIBook's
`.env.local` at the repository root. The endpoint can be any host of a Foundry
resource (`*.services.ai.azure.com`, `*.cognitiveservices.azure.com` or
`*.openai.azure.com`). Realtime calls always go to the resource's
`*.openai.azure.com` host, where Azure serves the realtime API.

Required settings in `.env.local`:

```bash
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-realtime
```

Optional settings:

```bash
AZURE_OPENAI_DEPLOYMENT=gpt-5-mini              # translations and recaps
AZURE_OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe  # default gpt-4o-mini-transcribe; "off" to disable
```

**Authentication** uses Microsoft Entra ID by default. Locally, run `az login`.
On Azure, use a managed identity. Either way, the identity needs the
**Cognitive Services OpenAI User** role on the resource. To use a key instead,
set `AZURE_OPENAI_API_KEY`. To use OpenAI directly, leave
`AZURE_OPENAI_ENDPOINT` unset and set `OPENAI_API_KEY`.

Without a chat model, the conversation still works. The recap is then built
from the partner's live notes, and translations are off.

## Security

- The browser never sees an API key or token. Your browser sends its WebRTC
  offer to `/api/realtime`. The server creates a short-lived client secret for
  the session, exchanges the offer with the model service using that secret,
  and returns only the answer.
- Like InfiniAIBook, it listens on localhost only. Requests from other hosts
  (DNS rebinding) and cross-site write requests are refused. Before exposing it
  to other machines, set `LINGUA_PASSWORD` (HTTP Basic auth, any username) and
  `ALLOWED_HOSTS`.
- The microphone is the only device permission the app requests.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

| Path | Purpose |
|---|---|
| `src/lib/languages.ts` | Languages, quick language detection, "I'm lost" phrases |
| `src/lib/levels.ts` | CEFR levels: immersion share, speed, patience |
| `src/lib/personas.ts` `scenarios.ts` | Partners and situations |
| `src/lib/policy.ts` | Instructions for the model, the help-level state machine, coaching notes |
| `src/lib/realtimeConfig.ts` `tools.ts` | Realtime session shape and function tools |
| `src/lib/conversation.ts` | Pure reducer turning realtime events into transcript state |
| `src/lib/client/useConversation.ts` | Browser call: microphone, WebRTC, data channel, silence nudges, autosave |
| `src/lib/server/*` | Provider authentication, client-secret creation and SDP exchange, chat, SQLite |
| `src/app/api/*` | `realtime`, `translate`, `status`, `sessions` (+ `transcript`, `recap`) |

Sessions are stored in `.data/lingua.db` (change the location with
`DATA_DIR`).
