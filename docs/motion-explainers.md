# Motion explainers

The 🎞️ button turns your sources into a short 2D animated explainer. Flat
vector characters and objects slide and pop into simple scenes, headlines
animate on word by word, stat cards count up and scenes change with wipes and
slides. A narrator tells the story over it, and an optional music bed plays
underneath.

The **focus box** at the top of the Studio panel steers it, like every other
generator.

## The story

Each video follows the arc used by product and explainer videos:

| Beat | What it covers |
|---|---|
| Problem | The pain or question the sources address, made concrete |
| Solution | What the sources propose |
| How (×3) | One mechanism or step each, in order |
| Benefits | The payoff, with a number from the sources if there is one |
| Next step | The one thing a viewer should do next, shown on a closing card |

Every claim is grounded in the excerpts. The planner is told never to invent a
number, a URL, a price or an offer. A stat card only appears when the value
contains a digit, and the closing card recaps a next step taken from the
sources. Scene prompts are barred from naming real brands, logos or people.

## How it is built

```
sources ─► scene planner ─► pictures ─► narration ─► timeline ─► renderer ─► MP4
```

1. **Plan** (`src/lib/motion.ts`). One JSON call writes the scenes, a palette
   and a description of the recurring hero character. The normalizer clamps
   lengths, whitelists every enum, spreads actors across the left, center and
   right slots, and caps the pictures: at most two actors per scene and eight
   props per video.
2. **Pictures** (`src/lib/motionbuild.ts`). The image model draws a background
   plate for each scene, the hero **once** (reused in every scene it appears
   in, which keeps the character consistent) and each prop. Characters and
   props are requested with a transparent background. Every prompt starts with
   the same style description and palette, so the pieces look like one film.
   A picture that fails is dropped and the video goes on without it. A
   configuration or permission error stops the build.
3. **Narration**. Each scene is voiced by Azure Speech. The clip lengths set
   the scene lengths.
4. **Timeline** (`src/lib/motiontimeline.ts`). A pure function turns the plan
   and clip lengths into the exact render config: when each scene starts,
   where each layer sits, and when each word, chip and character arrives. All
   timing lives here so it can be unit-tested.
5. **Render** (`scripts/motion/render.py`). Plays the config back: a slow
   push-in on each background, eased entrances followed by a gentle float or
   bob, kinetic type, transitions, a closing card and a fade out. Frames are
   piped to FFmpeg, then narration is placed on the soundtrack, the music (if
   any) is ducked under the voice, and the mix is normalized to −16 LUFS.

**The image model never draws text.** Headlines, sublines, chips, stats and the
closing card are set by the renderer in a real font, because image models
misspell lettering.

**Opaque cutouts still work.** If a model or endpoint ignores the transparency
request, the renderer keys out the background from the border inward. A white
area inside the object, like a phone screen, is kept.

## Setup

It uses the same pieces as [whiteboard videos](whiteboard-videos.md): the
configured image model (`AZURE_OPENAI_IMAGE_DEPLOYMENT` or `AI_IMAGE_MODEL`),
Azure Speech, and Python 3 with `numpy`, `Pillow` and `imageio-ffmpeg`:

```bash
python -m pip install numpy pillow imageio-ffmpeg
```

Set `PYTHON_BIN` if `python` is not the interpreter you want. To check the
renderer without spending any model calls:

```bash
npm run check:motion
```

That renders a 13-second video from synthetic shapes and tones into
`.data/motion-check/`. It covers every layer type, every transition, the
key-out and music ducking.

## Music

Music is off by default. To offer it, point `MOTION_MUSIC_DIR` at a folder of
tracks you have the rights to use (`.mp3`, `.m4a`, `.aac`, `.wav`, `.ogg` or
`.flac`). A **Music** checkbox then appears on the card. Each video picks one
track at random, loops it if needed, fades it in and out and ducks it under the
narration. No music ships with the app. Royalty-free doesn't always mean free
to redistribute, so check each track's license before you publish a video.

## Timings, measured

A seven-scene video about a one-page source took **12 minutes** end to end:
50 seconds to plan, 10.7 minutes for 14 pictures (six backgrounds, the hero and
seven props, about 45 seconds each), 20 seconds of narration and 50 seconds of
rendering. That produced a 99-second, 9.2 MB file at 1280×720, normalized to
−16 LUFS.

Pictures dominate, and they are drawn **one at a time**, for the same reason as
whiteboard videos: concurrent calls collide on a small image deployment's
per-minute limit. The prop cap (eight per video) bounds the worst case.

The build runs in the background, like the other videos. The artifact is saved
as soon as the plan exists, and the player shows each stage's progress.
