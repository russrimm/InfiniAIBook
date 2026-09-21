---
name: whiteboard-video
description: |
  Creates a narrated whiteboard-animation explainer video (MP4) on any topic: a real hand holding a marker
  visibly traces cartoon doodles and hand-lettered titles scene by scene, with a voice-over and a caption band.
  Use when the user asks to "make a whiteboard video about…", "create an explainer video", "animated hand-drawn
  video", "narrated whiteboard animation", "doodle video for beginners", or "turn this into a whiteboard explainer".
  Do NOT use for a single static illustration or infographic (use image-operations), a slide deck (pptx),
  or an audio-only podcast (PodcastGenerate directly).
cowork:
  category: custom
  icon: VideoClip
metadata:
  pluginTitleId: T_69bfdd77-3ec0-203d-3f9f-24a0c733813d
  publishedAt: "2026-09-02T21:15:21Z"
---

# Whiteboard Video

Produces a 60–90 second narrated whiteboard-animation MP4: clean AI-drawn scene artwork, a photo cutout of a
hand holding a marker that follows the actual ink strokes as they appear, per-scene voice-over, and a dedicated
white caption band under the artwork. Bundled script: `scripts/build_whiteboard_video.py`. Prompt recipes and
the default scene structure: `references/prompt-recipes.md`.

## When NOT to Use

- One picture, icon, or infographic → `image-operations`
- Slides / a deck → `pptx`
- Audio only → `host-PodcastGenerate` directly
- Editing a finished video file the user uploaded (trimming, re-encoding) — not supported here

## Inputs to settle before starting (use defaults, do not block)

| Input | Default |
|---|---|
| Topic + audience | from the request |
| Scene count | 6–8 (title, why it matters, 3–4 steps, tips, closing) |
| Narrator | warm, friendly, conversational; `single_host` |
| Length | 60–90 s, driven by narration |
| Resolution | 1920×1080, 24 fps, artwork in top 76%, caption band below |
| Style | black-line cartoon doodles, light blue + orange accents (see recipes) |

If the user supplies a script, use it verbatim for narration and build the scenes to match. If the user
supplies their own images, skip artwork generation for those scenes and use the images as-is (they must be on a
white background; anything else gets a plain white canvas behind it).

## Example

User: *"Make a whiteboard video about running a good retrospective, for new team leads."*

Scene plan (kept internal, not pasted to the user):

```text
1  RETRO BASICS          | mascot + a whiteboard with sticky notes | "Retrospectives - a quick guide for new team leads"
2  WHY IT MATTERS        | team around a table, lightbulb above     | "A retro turns last sprint's lessons into next sprint's plan."
3  1 SET THE STAGE       | timer + friendly ground-rules list       | "Step 1 - Open with a check-in and agree how you'll work together."
...
8  YOU'VE GOT THIS!      | team high five, confetti                 | "That's it - you're ready to run your first retro."
```

Then: 8 artwork calls in one batch → 5 narration calls, wait 60 s, 3 more → `working/config.json` →
`build_whiteboard_video.py` → view two stills → `host-CopyArtifact` → `Glob output/**/*` → summary.

Example `working/config.json`:

```json
{
  "output": "working/retro-whiteboard-narrated.mp4",
  "hand": "working/hand-marker.png",
  "art_height": 820,
  "scenes": [
    {"image": "working/scene-01.png", "caption": "Retrospectives - a quick guide", "audio": "working/narration-01.mp3"},
    {"image": "working/scene-02.png", "caption": "Step 1 - Set the stage", "audio": "working/narration-02.mp3"}
  ]
}
```

## Workflow

1. **Plan** — create progress tasks with `core-TaskCreate`. Write the scene list: for each scene a 3–4 word
   on-board title, a one-picture description, a one-line caption (≤ 2 lines on screen), and 1–2 narration
   sentences (~8–12 s spoken). Do not paste the full plan to the user; proceed.
2. **Generate artwork** — `host-ImageGenerate`, `orientation="landscape"`, `quality="medium"`,
   `destination="working"`, one call per scene **in a single parallel batch**, each prompt using the style
   descriptor verbatim plus "no hand, no marker" and "nothing in the lower right corner". Generate the hand
   cutout once with the hand prompt (reuse `working/hand-marker.png` if it already exists). View 1–2 results to
   confirm titles are spelled correctly; regenerate any scene whose title is misspelled.
3. **Record narration** — `host-PodcastGenerate`, `format="single_host"`, one call per scene with
   `filename="narration-NN"`. **Rate limit: 5 calls per minute** — send 5, wait 60 s, send the rest. Clips land in
   `output/`; copy them to `working/` before building.
4. **Build** — write `working/config.json` (see recipes) and run
   `python <skill scripts dir>/build_whiteboard_video.py working/config.json` (Bash description: "Rendering your
   video"; allow 8–10 minutes). The script times each scene to its narration, animates the hand along the strokes,
   fades between scenes, and muxes the audio.
5. **Check** — extract 2 stills with ffmpeg (`imageio_ffmpeg.get_ffmpeg_exe()`) and view them: hand tip on the
   ink, captions inside the band, no overlap.
6. **Publish** — `host-CopyArtifact(surface="output", source="working/<name>.mp4", destination="<name>.mp4")`,
   then `Glob output/**/*` before announcing. Name the file exactly.

## Output Format

- `<topic>-whiteboard-narrated.mp4` in the user's files (audio embedded)
- `narration-NN.mp3` + `.txt` transcripts (already in `output/` from PodcastGenerate)
- Chat summary: what changed/what's in it (scene list in one line each), length, and offers: different voice,
  wording tweaks, square/vertical cut, background music.

## Fallbacks and error handling

- **Narration call fails or is rate-limited:** wait 60 s and retry once. If a clip still fails, render that scene
  silent (omit `audio` in the config — the script uses a fixed 6 s draw + 2.5 s hold) and tell the user which
  scene has no voice-over so they can re-record it.
- **Artwork has a misspelled or missing title:** regenerate that one scene with the same prompt (max 2 retries);
  if it still fails, shorten the title to 1–2 words.
- **Artwork contains a hand, marker, or content in the lower-right corner:** regenerate with the "no hand, no
  marker" clause moved to the start of the prompt.
- **Hand cutout tip lands in the wrong place** (check a still): regenerate the hand with the tip clearly the
  upper-left-most point, or crop the image so it is.
- **Render exceeds ~10 minutes or fails:** re-run once; if it fails again, drop to 1280×720 (`width`/`height` in
  the config) and tell the user the resolution was reduced.
- **User wants square or vertical output:** set `width`/`height` in the config (e.g. 1080×1080, 1080×1920) and
  regenerate artwork with `orientation="square"` or `"portrait"`; the caption band scales automatically.
- **No narration wanted:** omit every `audio` entry; the script produces a silent MP4 with captions only.

## Guardrails

- Never fabricate product facts in narration; when the topic is a real product, stick to what the user said or
  what M365 search / web search confirms — otherwise keep statements generic.
- No real brand logos, trademarked characters, or likenesses of real people in scene prompts.
- Keep on-board text to one short title per scene; long hand-lettered text misspells.
- Do not ask clarifying questions before starting when a reasonable default exists; ask only if the topic itself
  is missing.
- All rendering happens in `working/`; publish only the final MP4 with `host-CopyArtifact`. Never claim the video is
  ready before `Glob output/**/*` shows it.
- Bash descriptions are user-visible: use plain language ("Rendering your video"), never script or tool names.
- Never re-run `host-PodcastGenerate` for a clip that already exists in `output/` — reuse it; re-record only lines
  the user changed.
- Always view at least two stills before publishing; never publish a render you have not looked at.
- Must keep total length under 2 minutes unless the user asks for longer; trim narration rather than speeding it up.
- Never overwrite a previously delivered video — use a new filename (e.g. add `-v2`) so the user can compare.
- Never include internal paths, tool names, or session details in the chat summary — name the file only.
