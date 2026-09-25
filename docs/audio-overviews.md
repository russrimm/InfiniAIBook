# Audio overviews

The 🎧 button writes a dialogue grounded in your sources, then narrates it with
Azure Speech and stores an MP3 under `.data/audio/`.

Audio overview supports solo explainers, two-host deep dives, three-speaker
expert panels, and four-speaker debates. Each speaker can have a custom voice,
display name, and role/personality, which guides the script so turns are written
in character. Built-in episode profiles pre-fill common formats, but names and
roles can be edited before generation. Saved podcasts include speaker profiles
for transcript labels and exports, while older two-host artifacts continue to
render normally.

## Setup

Point the app at an Azure AI Services (or Speech) resource:

```ini
AZURE_SPEECH_REGION=eastus2
AZURE_SPEECH_RESOURCE_ID=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<name>
```

The identity needs the **Cognitive Services Speech User** role. An
`AZURE_SPEECH_KEY` works instead if you prefer key auth. Without either, the rest
of the app is unaffected — only the audio button reports that it is unconfigured.

The script prompt forbids markdown, citation markers and symbols that a voice
would mangle, and the server strips any that slip through, so nothing reads
"bracket two" aloud.

## How the script is written

The script is written to a professional podcast brief: a cold open that leads
with the most arresting thing in the material, three or more segments each
taking one distinct aspect and handing off to the next, and a close that recaps
what is worth remembering. Stage directions such as `[MUSIC: upbeat intro]` are
stripped before synthesis, so the voice never reads them aloud.

It uses `en-Multitalker:DragonHDLatestNeural`, Azure's multi-speaker voice, so a
whole exchange renders in one request and the hosts actually sound like they are
talking to each other. Turns are synthesised in small batches — a single large
request has its connection dropped by the service — and the resulting MP3s are
concatenated. Because the output is constant-bitrate, batch durations are exact,
which is what drives the synced transcript.

## Jumping to a topic

The script is written in named segments, and those become **chapters** in the
player: a dropdown and a row of chips above the transcript, plus taller marks on
the scrubber. Selecting one seeks the audio to where that topic starts, and the
dropdown follows along as it plays.

Segment titles have to name the content ("What the cost actually covers"), not
the position ("Segment 2"), because they are what a listener scans to find the
bit they want.

Chapters survive the length correction: if an over-long script is trimmed, each
marker moves with its turn rather than staying at an index that now holds
something else, and a segment cut away entirely loses its marker instead of
pointing somewhere arbitrary. Overviews generated before this existed still play
— they simply have no chapters.

## Laughter, sighs and sound effects

The hosts can react with a sound where a person would — "Ha!" at something
absurd, "Hmm." while weighing an objection, "Phew." at a large number. These are
written into the script and spoken as written, capped at two or three in a whole
conversation: they are a tic rather than warmth if overused. A generated
three-minute overview used one across fifteen turns.

What is *not* possible, and why:

**Emotion styles.** Of 116 en-US voices, only 24 declare any style, and none
declares laughter or sighing — the closest are `cheerful`, `excited`, `sad` and
`whispering`. The multitalker declares none at all, and `mstts:express-as` is
accepted and ignored rather than refused.

**Stage directions.** `(laughs)` and `[SFX: door closes]` are read aloud, word
for word. The prompt forbids them and `cleanSpoken` strips them anyway, because
a model trained on recording scripts reaches for them regardless.

**Recorded clips** are possible but not wired up. `<audio src>` genuinely works
— a two-second clip added 1.96 seconds to a multitalker turn and 1.55 to a
classic one — and `<mstts:backgroundaudio>` mixes a bed underneath rather than
appending it. Two things make it more than a one-line change: the service
fetches the URL itself, so clips must be public HTTPS rather than served from
`.data/`, and a clip it cannot reach is skipped **silently**, so a broken effect
would be invisible rather than an error.

## Voice and pace

Five controls sit on the Audio overview card:

**Length** — Short, Medium or Long, with the rough running time shown against
each:

| | Target | Typical | Generation time |
|---|---|---|---|
| Short | ~3 min | 11–14 turns | ~2.5 min |
| Medium | ~6 min | 22–26 turns | ~4 min |
| Long | ~10 min | 34–38 turns | ~6 min |

The targets come from measurement, not estimation: 2,261 words across 14.0
minutes of generated overviews works out at **161 words per minute**,
consistently across three separate notebooks. Each length is a word budget
derived from that rate.

Asking for a word count is not enough on its own. Asked for three minutes the
model wrote 885 words against a 480 target; asked for ten it wrote 3,849 against
1,610 — over twice the length, both times. So the draft is measured, and if it
misses it is rewritten with its own numbers quoted back to it ("your draft was
3,849 words, which runs about 23 minutes; the target is 10 minutes"), which is
concrete in a way a target alone is not. If a rewrite still comes back far too
long it is trimmed, keeping the opening and the closing two turns so the
conversation does not end mid-thought.

Measured after that change: 2.8 min against a 3 min target, 7.0 against 6, and
9.5 against 10.

**Hosts** — pick each voice individually from the 25 en-US DragonHD speakers,
grouped by female and male:

> Ava · Aria · Bree · Emma · Evelyn · Jane · Jenny · Mila · Nova · Paige ·
> Phoebe · Serena · Tessa · Tiana · Adam · Alloy · Andrew · Brian · Colin ·
> Davis · Jimmie · Juno · Steffan · Tyler · Vance

A name tells you nothing about how a voice sounds, so each picker has a **▶
button that plays a sample**: *"Hello, I'm Nova. It's a pleasure to meet you!"*
in that speaker's voice. Change the dropdown and press play again to audition
the next one.

Samples are rendered on first request and cached under `.data/voices/`, so the
first play of a given voice takes a second or two and every later one is
instant. The button shows `…` while rendering and `◼` while playing.

Both pickers stay active under *Fixed voices*, so the hosts you chose are the
hosts you get.

The two pickers exclude each other's current choice, because two identical
speakers render the dialogue in a single voice — which reads as a bug rather
than a decision. Names are validated server-side too, because the service does
**not** reject an unknown speaker: it quietly renders in a different voice, so a
typo would otherwise be invisible.

**Speed** — 0.8× to 1.25×, applied as SSML `prosody rate`, which the multitalker
voice takes as a multiplier and classic neural voices as a percentage offset.
Measured effect: a 1.25× overview came back at 7.7 seconds per turn against 9.7
at normal speed.

**Engine** — *Natural dialogue* (the default) renders the whole exchange through
the multitalker voice in one request, so the hosts hand off to each other.
*Even delivery* is the same voice with pause shaping switched off. *Fixed
voices* renders each turn with a named standalone voice instead.

## If a voice wanders

The multitalker is one generative model rendering a whole conversation, and the
speaker name is **conditioning, not selection** — it steers the output towards a
voice rather than loading one. So identity can drift, occasionally within a
turn.

*Fixed voices* removes that by construction: each turn names an actual voice
model, which cannot become a different one. Measured over repeated renders of
the same line:

| | Run-to-run median pitch | Within-turn spread |
|---|---|---|
| Ava, multitalker | 8% | 102 Hz |
| Ava, fixed | **2%** | 88 Hz |
| Andrew, multitalker | 9% | 88 Hz |
| Andrew, fixed | **2%** | **54 Hz** |

The cost is that turns are rendered independently, so the hosts stop reacting to
each other's delivery and it sounds a little more read-aloud.

Only **13 of the 25 speakers** exist as standalone voices — Ava, Aria, Emma,
Evelyn, Jane, Jenny, Phoebe, Serena, Adam, Andrew, Brian, Davis and Steffan. The
rest exist only inside the multitalker, and choosing one with fixed voices is
refused with the list rather than quietly substituted.

## Making it sound less read-aloud

Two things carry this, and only one of them is SSML.

**The script.** Most of the difference between speech and narrated prose is in
the writing, so the dialogue prompt asks for it directly: hard variation in turn
length, contractions throughout, sentences that qualify themselves mid-thought,
openers people actually use ("Right, so", "OK but", "Here's the thing"), and
questions that push back rather than invite more. It explicitly bans "um" and
"uh" — on a synthetic voice those read as a glitch, not as thinking.

**Pauses.** Em dashes, ellipses, opening interjections, pivots like "But" and
"Still", and the gap before a reply are rendered as real `<break>` tags, with
durations jittered per line from a seed derived from the text — so the same line
always breathes the same way, but no two lines are metronomic.

## What the voice actually supports

Established by measurement, because the service accepts markup it does not
implement and returns audio anyway:

| Feature | Result |
|---|---|
| `<break time>` | **Works, and scales** — 2500ms added 2.78s over 200ms |
| `<prosody rate>` | **Works** — 0.8 lengthens a sample by about a third |
| `<prosody volume>` | **Rejected** — HTTP 400 on the multitalker voice |
| `<mstts:express-as>` | **Accepted and ignored** — no styles declared for these voices |
| `<mstts:silence>` | Accepted, no measurable effect |
| `<prosody pitch>`, `<emphasis>`, `<prosody contour>` | Accepted; unverifiable |

That last row is the honest one. Pitch and emphasis do not change duration, and
synthesis is **not deterministic** — identical input varies about 13% run to
run — so byte comparison cannot separate a tag's effect from noise. Nothing is
built on them: markup that is silently dropped looks exactly like a working
feature.

Verified end to end: the same four turns rendered 14.69s with pauses off and
17.10s with them on, which is the inserted break time and not the tags being
read aloud.

The same choices are available on the API:

```bash
curl -X POST localhost:3000/api/podcast -H 'content-type: application/json' \
  -d '{"notebookId":"...","voices":{"a":"Davis","b":"Nova"},"rate":1.1,"length":"long"}'

# and a single speaker's sample
curl localhost:3000/api/voice-preview/Nova --output nova.mp3
```

What is *not* available on these voices: `mstts:express-as` styles. The voice
list declares none for the multitalker or for Ava, and only `empathetic` and
`relieved` for Andrew's multilingual variant. Requests carrying a style are
accepted and ignored rather than refused, so the app does not offer them.
