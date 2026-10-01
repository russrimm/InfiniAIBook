# Live discussions

Talk through your sources out loud with an AI that answers right away, lets you
interrupt, and backs its points with citations you can click. Open it from
**Studio > Live > 🎙️ Live discussion**.

## Kinds of conversation

| Mode | What happens |
|---|---|
| 💬 Discussion | A well-read partner explores the material with you, connects sources and asks good questions |
| ⚖️ Debate | You argue a position; the AI argues the other side using the sources as evidence, concedes fair points and never invents evidence. Leave the position empty and the AI proposes a contested claim from the sources |
| ❓ Q&A | Ask anything; short spoken answers, with an offer to go deeper |
| 🎤 Interview an expert | You're the interviewer; the AI answers as the author of your sources |
| 🧑‍💼 Get interviewed | The AI interviews you about the material, follows up on vague answers and pushes back when an answer conflicts with the sources |
| 🧠 Oral quiz | Spoken questions with instant feedback and a running score |
| 🧑‍🏫 Socratic tutor | Learn by answering guiding questions; misconceptions are corrected with evidence |

Pick a **voice** (the AI is named after it) and an optional **focus**. The
Studio focus box fills it in.

## During the call

- **Just talk.** The AI waits for you to finish a thought and stops as soon as
  you cut in. In the modes where it asks you questions, it waits a little
  longer before answering, and checks in kindly after a long silence.
- **Citations.** When a point relies on specific passages, they appear as
  numbered chips on that line. Click one to open the source at that passage.
  The AI never reads numbers aloud. It mentions sources by name, the way a
  person would.
- **Looking things up.** The AI starts with a broad sample of your selected
  sources, plus the passages that best match the focus. When the conversation
  moves past those, it searches your sources mid-sentence ("let me check…").
  The transcript notes each lookup.
- **Quick actions:** *Where's that from?*, *Simpler*, *Go deeper* and *Recap
  so far*, plus *Hint* and *Skip* in the quiz and interview modes, and *Rate
  my argument* in a debate.
- **Type instead.** Send a typed message when speaking isn't convenient.
- Quiz, interview and tutor answers are marked ✅ 🟡 ❌ with one line of
  feedback.

## Saving

After you hang up, **Save to notes** adds a note with:

- **Takeaways** written by the chat model and checked against the cited
  passages, including anything said in the conversation that the sources
  don't support. Debates get a fair verdict, and quizzes a score and topics to
  review.
- The marked **answers** from a quiz, interview or tutoring session.
- The full **transcript**, with its citations kept clickable.

If the takeaways can't be written, the transcript is saved anyway.

## Setup

Live discussions need a realtime voice model. Your other models are not used
for the conversation itself, though the chat model writes the takeaways.

```bash
# Azure OpenAI or Microsoft Foundry: same endpoint and sign-in as chat
AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-realtime-2.1
# or, with AI_PROVIDER=openai
AI_REALTIME_MODEL=gpt-realtime
```

- Deploy a realtime model (`gpt-realtime`, `gpt-realtime-2.1`,
  `gpt-realtime-2.1-mini`, …). Global deployments are offered in **East US 2**
  and **Sweden Central**. A new deployment can take about five minutes before
  it accepts calls. Until then the app says so.
- `AZURE_OPENAI_ENDPOINT` can be any host of the resource
  (`*.services.ai.azure.com`, `*.cognitiveservices.azure.com` or
  `*.openai.azure.com`). Realtime calls always go to its `*.openai.azure.com`
  host, where Azure serves the realtime API.
- Entra ID sign-in uses the same **Cognitive Services OpenAI User** role as
  chat. `AZURE_OPENAI_API_KEY` works too.
- `AI_REALTIME_TRANSCRIPTION_MODEL` (default `gpt-4o-mini-transcribe`, or
  `off`) shows what you say in the transcript. No separate deployment is
  needed.
- `DISCUSSION_CONTEXT_CHARS` (default 16000) is how much source text the AI
  starts with. It searches for the rest.
- Other providers (Anthropic, Gemini, local models…) have no realtime voice
  model. The card then explains what to set.

The browser needs a microphone and must reach the app on `localhost` or over
HTTPS. Headphones keep the AI from hearing itself.

## How it works

1. The browser opens a WebRTC connection and sends its offer to
   `POST /api/discussion`.
2. The server builds the session. It picks the opening passages from your
   selected sources and composes the instructions: the mode's role and rules,
   speaking style, and strict grounding rules with numbered excerpts. It adds
   three tools: `search_sources`, `cite_sources` and `record_answer`.
3. The server creates a **short-lived client secret** for that session and
   exchanges the offer with the realtime service itself. The browser gets back
   only the answer. It never sees a key, token or secret.
4. Audio flows directly between the browser and the realtime service. Events
   arrive on a data channel: transcripts, speech start and stop, and tool calls.
5. When the AI calls `search_sources`, the browser asks
   `POST /api/discussion/search`. That endpoint runs the same hybrid retrieval
   as chat and returns new excerpts numbered after the ones the AI already
   has. Passages the AI already has keep their numbers.
6. **Save to notes** posts the transcript to `POST /api/discussion/save`. The
   chat model writes the takeaways from the transcript and the full text of the
   cited passages.

Nothing is stored until you save. Closing the page during a call asks first.
