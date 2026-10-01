# Screen helper

The 🖥️ **Screen helper** coaches you through any app on your computer. Share
the app's window, type what you are trying to do ("Add a column filter in this
spreadsheet", "Share this document with my team"), and the helper looks at your
screen and walks you through it **one step at a time**, with a numbered box
on a snapshot of your screen showing where to click.

Open it from the header on the home page or in any notebook.

## How it works

1. **Type what you need help with.** That becomes the goal for the session.
2. **Choose what to share.** Your browser asks which screen, window or tab to
   share. Pick the single app window you need help with: it gives the model a
   clearer picture than the whole screen, and keeps InfiniAIBook itself out of
   the frame.
3. **Follow the highlighted step.** Each answer explains what you are looking
   at, names the next control exactly as it is labeled, and draws a numbered box
   around it on the screenshot the helper analyzed. The box is approximate, so
   the step text always names the control too.
4. **Keep going.** Ask follow-ups, or use the quick replies: *I did that.
   What's next?*, *I can't find it.* and *What does this screen do?* Every
   message sends a fresh screenshot along with the conversation so far.

When the goal looks done on screen, the helper says so and suggests what you
might do next. **Start over** keeps sharing and clears the goal.

### Auto-watch

With **Auto-watch** on (the default), the helper checks your screen every few
seconds. When the screen has **changed** since the last screenshot it analyzed
and has **stopped moving**, it looks again and suggests the next step. You do
not have to switch back and ask. Typing, scrolling and playing video do not
trigger a call on every sample, because the screen must settle first. Calls are
at least 10 seconds apart, and only one runs at a time. Check-ins where nothing
relevant changed are not added to the conversation.

Auto-watch keeps running while you work in the other app. When a new step
arrives while the InfiniAIBook tab is hidden, the tab title is marked
**● New step**. Turn on **Read steps aloud** to hear each new step, which
helps when the helper is behind your app.

Auto-watch turns itself off after a configuration error, such as a model that
cannot read images, so the same failure does not repeat every few seconds.

### Saving a session

Inside a notebook, **Save as note** saves the goal, the numbered steps and the
conversation as a note. Screenshots are not saved.

## Requirements

- **A vision model.** The helper uses the model chosen under
  **Models → Image reading** (`AI_VISION_MODEL` or
  `AZURE_OPENAI_VISION_DEPLOYMENT`, defaulting to the chat model). The first
  request checks once, with a tiny low-detail image, that the model really
  reads images. A text-only model would otherwise ignore the screenshot and
  make up an answer. If the check fails, the helper explains which setting to
  change. See [Configuration](configuration.md#models-and-what-theyre-used-for).
- **HTTPS or localhost.** Browsers only allow screen sharing in a secure
  context. It works at `http://localhost:3000`. Over a LAN (`npm run dev:lan`)
  you need HTTPS, for example through a reverse proxy, and the helper says so.
- **A desktop browser** with screen sharing: current Edge, Chrome or Firefox.
  Mobile browsers do not support it.

## Privacy and cost

- Screenshots are taken **only while you share**, and only when the helper
  needs one: when you send a message, or when auto-watch sees a settled change.
  They are sent to your configured vision model and are **never stored** by
  InfiniAIBook.
- Anything visible in the shared window goes to the model. Close or hide
  sensitive content first. The helper is told never to read out passwords or
  codes, but it cannot unsee them.
- The helper cannot click or type for you. It only explains.
- Each turn sends one screenshot, scaled to at most 1600 pixels on its longest
  edge and sent at high detail so small labels are readable. Auto-watch adds a
  call only when the screen really changes. Turn it off to pay only for the
  messages you send.

## How it is built

| Piece | File |
|---|---|
| Prompt, request schema, reply parsing, box normalization, change detection, note format | `src/lib/screenhelp.ts` |
| One coaching turn: validate, check that the model reads images, call the vision model | `src/app/api/screen-help/route.ts` |
| Vision probe | `assertReadsImages` in `src/lib/vision.ts` |
| Screen sharing and frame capture (`getDisplayMedia`) | `src/components/useScreenCapture.ts` |
| Dialog, highlight overlay and auto-watch loop | `src/components/ScreenHelperModal.tsx` |

The model returns JSON with a `status` (`next_step`, `answer`, `done`,
`cannot_see` or `unchanged`), Markdown to show, the single next `step`, and a
`target` box in screenshot pixels. The route converts the box to fractions of
the frame, and drops boxes that are empty, fall off the screen or cover most
of it. A wrong highlight is worse than none.

## Tests

- `npm test` covers the pure logic in `tests/screenhelp.test.ts`.
- `npm run test:e2e` runs the Playwright suite in `e2e/`. The tests replace
  `getDisplayMedia` with a canvas that draws a fake app, so no permission
  prompt appears. Most tests script the model's replies. One runs the real
  route against `e2e/mock-llm.mjs`, a local OpenAI-compatible stand-in, so no
  provider or credentials are needed. The suite starts its own dev server on
  port 3123 with a temporary `DATA_DIR`. Run `npx playwright install chromium`
  once first.
