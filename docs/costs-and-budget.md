# Costs, budget and cancelling

Generating with models and speech costs money on a cloud provider. The app
estimates what a generation will cost before it starts, counts spend against a
daily ceiling, and lets you stop a generation or build that is running.

## Estimates

Before an audio overview, whiteboard video, motion explainer, training video,
infographic or any other Studio format starts, the app asks the server what it
is expected to cost. The status window shows the answer, for example
*Estimated cost: about $0.84. This is an estimate, not a quote.*

An estimate is the number of provider calls the generator makes, multiplied by
a rough price for each kind of call. It is not a quote: your plan, model,
region and discounts decide the real bill, and actual usage can differ (a
script that needs a length correction makes one more call, for example).

| Call | Default | Variable |
|---|---|---|
| One Studio or chat-model call that writes a script or document | 8¢ | `PRICE_STUDIO_CALL_CENTS` |
| One generated picture | 12¢ | `PRICE_IMAGE_CENTS` |
| Text-to-speech, per 1,000 characters (each call counts at least 4¢) | 3¢ | `PRICE_SPEECH_PER_1K_CHARS_CENTS` |
| Avatar video, per 150 spoken words, about a minute (each render counts at least 25¢) | 40¢ | `PRICE_AVATAR_PER_150_WORDS_CENTS` |

The same prices are what the daily budget charges as each call is made, so the
estimate and the budget always agree. Set a variable to match your rate card
(whole or fractional cents). Video clips have their own estimate from the
provider's per-second price; see [Video clips](video-clips.md).

What each generator counts:

- **Report, briefing, study guide, FAQ, quiz, flashcards, mind map, timeline, slides:** one model call.
- **Infographic:** one model call, plus one picture when the style is *AI image*.
- **Audio overview:** the script (counted as two calls, for the length check) and the narration for the chosen length.
- **Whiteboard video:** the script, one picture per scene, the hand marker (once, then reused), and narration per scene.
- **Motion explainer:** the script, a background per scene, the character and props, and narration per scene.
- **Training video:** the transcript, the presenter's running time, timing the narration, and, for composed videos, up to one picture per section.

## Confirmation and the daily budget

- **Large estimates ask first.** An estimate of $1.00 or more opens a
  confirmation with the breakdown before anything is billed. Set
  `COST_CONFIRM_USD` to change the size (for example `5`), or to `0` to never ask.
- **Over budget is refused up front.** `DAILY_BUDGET_USD` is the daily ceiling
  (default $25 for cloud providers, off for local models; `0` turns it off).
  When today's remaining budget cannot pay for the estimate, the status window
  says how much it would cost and how much is left, and nothing starts.
- The budget counts a call when it is made. A call that fails or is cancelled
  after it started is still counted, so a retry loop cannot spend without limit.

## Cancelling

| Where | What Cancel does |
|---|---|
| Status window while a Studio format is being written | **Cancel generation** stops the model calls and the wait. Nothing is saved. |
| Whiteboard video or motion explainer being built | **Cancel** stops artwork, narration and the renderer process. The previous video, if any, is unchanged. |
| Audio overview being narrated | **Cancel** stops the speech calls. The script is unchanged. |
| Training video rendering | **Cancel render** deletes the avatar jobs at the provider, stops compositing, keeps clips already downloaded, and returns to the transcript (or the previous video). |
| Video clips | **Cancel** (unchanged): stops the run, keeps finished clips, deletes the rest at the provider. |

A cancelled item shows a clear *Cancelled* message, not an error. Work that a
provider had already started cannot always be recalled, so it may still be
billed; nothing new is started after you cancel.

Closing the browser tab does **not** cancel anything: a long generation or
render keeps going and is waiting for you when you return. Cancelling is always
an explicit action. Jobs live in the server process, so a restart ends both the
work and its Cancel button.

## REST API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/estimate` | `{ type, ...the generator's options }` returns `{ cents, usd, display, lines, fits, message, confirmAboveCents, budget }` |
| POST | `/api/jobs/{id}/cancel` | Stops running work. `{ cancelled: boolean }` (false when nothing was running, for example because it just finished) |

To make a generation request cancellable from a script, send a fresh
`x-job-id` header (8 to 40 letters, digits, `-` or `_`) with `POST /api/generate`,
`/api/podcast`, `/api/video`, `/api/motion` or `/api/training`, then
`POST /api/jobs/{that id}/cancel`. A cancelled request answers `499` with
`{ "error": "Cancelled.", "code": "cancelled" }`. Builds and narration are
cancelled with the artifact's own id.
