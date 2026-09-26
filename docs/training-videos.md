# Training videos

The 🧑‍🏫 **Training video** card turns a notebook's research into a short
training session delivered by a realistic, lip-synced presenter. It works in
two steps, so nothing is billed for video until you are happy with the script.

1. **Write transcript.** The selected sources, every note in the notebook
   (including chat answers you saved as notes) and the focus box are combined
   into a trainer's script: a welcome and learning objectives, a handful of
   teaching sections, a recap, and a spoken knowledge check. The script is saved
   as a `training` artifact and opens in an editor.
2. **Render video.** Edit the title, sections and presenter, then press
   **Render video**. The script is sent to Azure's text-to-speech avatar batch
   service, which renders an MP4 of the presenter speaking it on a solid brand
   background, with subtitles burned in. The finished file is saved locally and
   plays in the artifact; **MP4** in the header downloads it.

Editing is locked while a render runs. If you change the script afterwards, the
editor says the video is out of date and offers **Render again**.

## Why the text-to-speech avatar, not a generative video model

Foundry offers two ways to produce a person on video:

| | Sora 2 (Azure OpenAI) | Text-to-speech avatar (Azure Speech) |
|---|---|---|
| Clip length | 4–12 seconds per generation | Up to 20 minutes per job |
| Same presenter throughout | No — each clip is a new person | Yes |
| Lip-sync to a script | No | Yes, driven by the neural voice |
| Approximate price | ~$0.10 per second (~$6 per minute) | Roughly $0.50–$2 per minute |
| Entra ID auth | Yes | Yes |

A training video is minutes of one person talking, so it needs a stable,
lip-synced presenter for its whole length. Sora is the better creative model,
but it cannot hold a presenter across clips and costs several times as much.
The avatar service is the best fit for this job at a fraction of the price.

## Setup

Training videos reuse the Azure Speech configuration from
[Audio overviews](audio-overviews.md). Additionally:

- The Speech (or AI Services) resource must be in an **avatar region**:
  East US 2, West US 2, South Central US, West Europe, North Europe,
  Sweden Central or Southeast Asia.
- Your identity needs **Cognitive Services Speech User** on that resource. It
  includes the `BatchAvatar/*` data actions. Subscription *Owner* or
  *Contributor* does not grant them, so an Owner still gets a 403.

  ```bash
  az role assignment create --assignee <your-object-id> \
    --role "Cognitive Services Speech User" --scope <AZURE_SPEECH_RESOURCE_ID>
  ```

- Entra auth calls the resource's custom-domain endpoint,
  `https://<account>.cognitiveservices.azure.com`, derived from
  `AZURE_SPEECH_RESOURCE_ID`. Set `AZURE_SPEECH_ENDPOINT` if yours differs.
  With `AZURE_SPEECH_KEY` the regional endpoint is used instead.

Optional settings:

| Variable | Effect |
|---|---|
| `AZURE_AVATAR_BACKGROUND_URL` | A public image shown behind the presenter instead of the chosen colour |
| `AZURE_AVATAR_PRICE_PER_MINUTE` | Shows an estimated cost in the editor before rendering |

## Presenters and voices

Seven standard avatars are offered (Lisa, Lori, Meg, Harry and Max in several
styles). Each has a default neural voice, and you can pick any of the pinned
voices instead. The avatar called Jeff is left out because Microsoft retires it
in December 2026.

## Limits and behaviour

- **Length.** Short, medium and long target about 3, 6 and 10 minutes. The
  service accepts up to 20 minutes, and the editor blocks rendering when the
  word count would exceed that.
- **Rendering time.** Azure renders in the cloud, typically a few minutes of
  wall-clock time per minute of video. Progress is stored on the artifact, so
  you can close it and carry on; watching resumes after a server restart.
- **Cleanup.** Once the MP4 is downloaded, the Azure job is deleted. Deleting
  the artifact or its notebook deletes the local file too.
- **Billing.** The finished artifact records the avatar seconds Azure billed.
