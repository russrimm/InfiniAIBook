# Video clips

The 🎥 **Video clip** generator makes short AI-generated video clips from your
notebook's sources, for use as B-roll or on their own. You pick sources as
usual, the chat model drafts one to three clip prompts grounded in them, you edit
the prompts, see what it will cost, and only then press **Generate**.

It is **off until a video model is configured**. With none set, the Studio card
says "No video model is configured" and links here; nothing is ever billed.

> **Sora 2 is retired.** OpenAI discontinued the Sora API on September 24, 2026,
> and Azure OpenAI retired the `sora-2` (2025-12-08) model on November 2, 2026
> (see Microsoft's [retired models](https://learn.microsoft.com/azure/foundry/openai/concepts/retired-models)).
> Nothing in InfiniAIBook defaults to it. You choose the model.

## Providers

| Provider | Set | Notes |
|---|---|---|
| **Google Gemini** (recommended) | `AI_VIDEO_PROVIDER=gemini` and `GEMINI_API_KEY` | Gemini Omni Flash (`gemini-omni-1.2-flash`) through the Interactions API. Paid tier only. 3 to 15 second clips, 16:9 or 9:16, 360p to 1080p, with native audio |
| **OpenAI-compatible Videos API** | `AI_VIDEO_BASE_URL`, `AI_VIDEO_MODEL`, optional `AI_VIDEO_API_KEY` | Any endpoint that implements `POST /videos`, `GET /videos/{id}`, `GET /videos/{id}/content` and `DELETE /videos/{id}`: OpenAI's own API when it serves a model, a gateway, or a model you host |
| **Azure OpenAI / Microsoft Foundry** | `AZURE_OPENAI_VIDEO_DEPLOYMENT` (with `AZURE_OPENAI_ENDPOINT`) | The same Videos API shape under `/openai/v1`, signed in with Entra ID or `AZURE_OPENAI_API_KEY`. Needs a deployed video model, and **none is available in East US 2 today**; this path exists for when Foundry offers one again |

Which one runs is decided by `AI_VIDEO_PROVIDER` (`gemini`, `azure` or `openai`).
Unset, it is inferred: an Azure video deployment means Azure, a `gemini-…` model
name means Gemini, and a base URL means the OpenAI-compatible provider. A
`GEMINI_API_KEY` on its own does **not** turn video on, because that key is also
used for YouTube transcripts and clips are the costliest thing it could start paying for.

### Setting up Gemini

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey) and enable billing on its project. The free tier does not include video.
2. In `.env.local`:

   ```bash
   AI_VIDEO_PROVIDER=gemini
   GEMINI_API_KEY=your-key
   # AI_VIDEO_MODEL=gemini-omni-1.2-flash   # the default
   ```
3. Restart the server. The Studio card now offers **Generate**.

### Setting up an OpenAI-compatible endpoint

```bash
AI_VIDEO_BASE_URL=https://your-gateway.example/v1
AI_VIDEO_MODEL=your-video-model          # required; there is no default
AI_VIDEO_API_KEY=...                     # or OPENAI_API_KEY / AI_API_KEY; none for a local gateway
AI_VIDEO_DURATIONS=4,8,12                # the whole seconds the model accepts (default 4,8,12)
AI_VIDEO_ASPECTS=16:9,9:16               # 16:9, 9:16, 1:1 (default 16:9,9:16)
AI_VIDEO_RESOLUTIONS=720p                # 720p, 1080p (default 720p)
AI_VIDEO_PRICE_PER_SECOND_USD=0.10       # your rate, for the estimate
```

The request is `multipart/form-data` with `model`, `prompt`, `size` (for example
`1280x720`), `seconds` and an optional `input_reference` image, exactly as the
[OpenAI Videos API](https://platform.openai.com/docs/api-reference/videos) and
Azure's [Create a video](https://learn.microsoft.com/azure/foundry/reference/rest/video-generation-create-video)
define it. Statuses `queued`, `in_progress`, `completed` and `failed` are understood.

### Setting up Azure OpenAI / Foundry

```bash
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_VIDEO_DEPLOYMENT=your-video-deployment
# AZURE_OPENAI_VIDEO_API_VERSION=preview   # only if your resource wants an api-version
```

Sign in with `az login`; the identity needs the **Cognitive Services OpenAI User**
role on the resource. The app asks for a token for `https://ai.azure.com/.default`
(the audience Microsoft documents for video) and, if that is refused with a 401,
once for `https://cognitiveservices.azure.com/.default`. Set `AZURE_OPENAI_VIDEO_SCOPE`
to force one. `AZURE_OPENAI_API_KEY` is used instead of Entra when set.

### Other providers

The provider contract is one small interface (`VideoProvider` in
`src/lib/videoclip.ts`: `capabilities`, `start`, `poll`, `download`, optional
`poster` and `remove`), so adding another hosted model is one new file beside
`src/lib/videogemini.ts` and `src/lib/videoopenai.ts`. Candidates that have a
public API: Runway, Luma Dream Machine, Kling, and Google's Veo through Vertex AI
(Veo in the Gemini API was shut down on October 22, 2026).

## Making clips

1. Tick sources, optionally type a **focus**, and press **Generate** on the Video clip card.
2. The composer drafts up to three prompts from the sources. Each describes one continuous shot with no on-screen text, no real people and no brands, because video models draw text badly and providers refuse likenesses and trademarks. **Edit them freely**, or press **Redraft from sources**.
3. Choose the shape (landscape, portrait, square where supported), length (only values the model accepts), quality, and how many **variants** of each prompt. Optionally upload a **reference image** (JPEG, PNG or WebP, up to 4 MB) that the clip starts from; pictures of recognizable people are usually refused.
4. The composer shows an **estimated cost**. Nothing is billed until you press **Generate** there.
5. The clips open in a viewer with live status for each (waiting, generating with progress where the provider reports it, downloading, ready, failed). You can close it and come back from the library; generation continues in the background. **Cancel** stops the run, keeps clips already finished, and asks the provider to delete the rest.

Each finished clip is saved as an MP4 under `DATA_DIR/clips` and listed in the
Studio library as a **Video clip** artifact that records the sources and
citations it was made from. Play it with seeking, **Download MP4**, **Rename**,
or delete it from the library, which also deletes the file and, where the provider
supports it, the remote copy.

One clip failing does not stop the others. A prompt the provider refuses is shown
as "Declined by the content filter" with the provider's own message so you know
what to reword.

## Costs

Video is billed per generated second, so the estimate is
`seconds × clips × rate`. The rates built in, and where they come from:

| Provider and quality | Rate (US dollars per second) | Source |
|---|---|---|
| Gemini Omni Flash 360p | 0.023 | [Gemini Developer API pricing](https://ai.google.dev/pricing), Standard tier, 1,931 output tokens per second at $12 per million |
| Gemini Omni Flash 720p | 0.07 | same, 5,792 tokens per second |
| Gemini Omni Flash 1080p (upscaled) | 0.104 | same, 8,688 tokens per second |
| OpenAI-compatible or Azure | 0.10 | A provider-neutral placeholder: set `AI_VIDEO_PRICE_PER_SECOND_USD` to your provider's rate |

So one 8 second 720p Gemini clip is about **$0.56**, and the cheapest test, a 3
second 360p clip, is about **$0.07**. These are **estimates**: provider prices
change and are shown with the "estimate" label wherever they appear.
`AI_VIDEO_PRICE_PER_SECOND_USD` overrides every rate.

Checked live (November 2026): a 3 second 360p Gemini clip billed 5,793 video output
tokens, exactly the 1,931 tokens per second above, plus 342 "thinking" tokens, so the
real cost is about **$0.073** against the $0.069 estimate. Expect the estimate to run
a few thousandths of a dollar per clip low. The reply came back in about 16 seconds as
a 640x360 H.264 MP4 with AAC audio, 1.8 MB, 3.03 seconds long. Google keeps the
interaction for 55 days on the paid tier; deleting a clip set here deletes it there too.

The estimate also counts against `DAILY_BUDGET_USD` (see [Configuration](configuration.md)):
a run that cannot fit under what is left of today's budget is refused before it
starts (HTTP 429, `code: "budget"`), and each clip is reserved as it is submitted,
so clips that were cancelled before they started are never counted. A clip that
fails after submission is still counted, because the provider may have billed it.
Configuring a video model turns the default $25 budget on even with a local chat model.

## Using clips in training videos

A [training video](training-videos.md#video-clips-as-visuals) can use a clip as
one of its visuals, played muted beside or instead of the presenter. Planning
proposes clips only when you tick **Propose video clips**, a clip is made only
when you press **Generate** in the visual's editor (with the same cost estimate,
budget check and **Cancel** as above), and rendering never makes one. Both
renderers fit the clip to its panel without stretching it, and hold its last
frame or loop it when it is shorter than the visual.

## Intro and outro clips

A [training video](training-videos.md#intro-and-outro-clips) or a
[motion explainer](motion-explainers.md#intro-and-outro-clips) can start and end
with a short clip. Both are **off by default**. Each can be made with the model
here (a prompt drafted from the video's title and script, editable before
anything is billed; the same estimate, daily budget, **Cancel**, retries and
status as above), picked from this notebook's clips, or uploaded as an MP4. A
generated clip is 16:9 like the videos and defaults to about 5 seconds, the
nearest length the model offers. It is saved under the video, keyed by its
prompt and options, so **re-rendering never regenerates or re-bills it**; only
**Regenerate** does. If the model cannot be reached or refuses a prompt, the
editor shows why and offers **Try again**, **Render without it** or another
source, and a render that would quietly leave a requested clip out is refused.

## Limits and reliability

- 1 to 3 prompts and at most 6 clips per run; at most `VIDEO_CLIP_CONCURRENCY` (default 2, up to 4) generate at once.
- A `429` waits for the provider's `Retry-After` and tries again; 5xx errors and dropped connections are retried within a bounded budget. A request that was **answered** is never repeated, because that could bill a second clip. A connection that drops while submitting is retried at most once.
- Polling starts every `VIDEO_CLIP_POLL_SECONDS` (default 5) and slows gradually. A clip that has not finished after `VIDEO_CLIP_TIMEOUT_MIN` minutes (default 20) is stopped and reported, with a warning that it may still be billed.
- Downloads stream to disk and are refused past `VIDEO_CLIP_MAX_MB` (default 200). A file is saved only if it really is an MP4.
- URLs are never taken from a provider's reply: job ids are checked and used in a fixed path, and a redirect to storage is followed without the credential and only to public hosts (the same guard as source fetching).
- Prompts are never logged. If the app restarts mid-run, the unfinished clips are marked failed with a note that they may have been billed.

## Content filtering

Providers apply their own safety filters to prompts, reference images and
results. Expect refusals for real people (including public figures), brands and
copyrighted characters or music, and anything violent or sexual. Gemini videos
carry an invisible SynthID watermark. Generated video is AI-made and can contain
mistakes; check it before you rely on it.

## Troubleshooting

| You see | Cause and fix |
|---|---|
| "No video model is configured" | Set one of the providers above and restart the server |
| "rejected the credential" | Gemini: check `GEMINI_API_KEY` and that billing is on. Azure: run `az login` and assign **Cognitive Services OpenAI User**. Other: check `AI_VIDEO_API_KEY` |
| "could not find the video model" | `AI_VIDEO_MODEL` or the Azure deployment name is wrong, or names a retired model such as Sora 2 |
| "is rate limiting video requests" | Automatic retries were exhausted. Wait, make fewer clips at once, or raise the quota |
| "Declined by the content filter" | Reword the prompt: remove people, brands and anything graphic |
| "did not finish the clip within N minutes" | A slow model. Raise `VIDEO_CLIP_TIMEOUT_MIN` |
| "would cost about … but only … is left" | Over today's budget. Make fewer or shorter clips, or raise `DAILY_BUDGET_USD` |

## For developers

`npm run test:e2e -- e2e/video-clip.spec.ts` runs the whole flow against
`e2e/mock-video.mjs`, a stand-in for the Videos API with a real playable clip, so
no provider or key is needed. `GET /api/videoclip` reports what the server can do,
and the [agent skill](agent-skill.md) documents the routes.
