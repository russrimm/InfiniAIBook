# Whiteboard videos

The 🎬 button plans six scenes from your sources, draws each one, narrates it and
renders an MP4 — a hand moving across the board, drawing the lines as they
appear, with a caption band underneath.

The **focus box** at the top of the Studio panel steers it, so the same notebook
can produce a video about whichever part of the material you want.

Each scene is planned as a picture rather than a paragraph: a short hand-lettered
title, one simple drawing described as objects rather than concepts, a caption,
and a line or two of narration. Every claim is grounded in the excerpts, and
scene prompts are barred from naming real brands, logos or people — the artwork
is original doodles.

## What it runs on

Scene artwork comes from the configured image model (`AZURE_OPENAI_IMAGE_DEPLOYMENT`
or `AI_IMAGE_MODEL`) and narration from Azure Speech, so both must be set up.
Frames are composited and encoded by a Python renderer,
`scripts/whiteboard/render.py`, which needs Python 3 with `numpy`, `Pillow`
and `imageio-ffmpeg`:

```bash
python -m pip install numpy pillow imageio-ffmpeg
```

Set `PYTHON_BIN` if `python` is not the interpreter you want.

## Timings, measured

A six-scene video took **6.5 minutes** end to end: about 3.5 minutes of artwork,
half a minute of narration, and 2.5 minutes of rendering, for a 3.6 MB file at
1280×720. Artwork dominates, and it is drawn **one scene at a time** — two
concurrent calls collide on a small image deployment's per-minute limit and
spend the retry budget racing each other rather than waiting.

Nothing blocks on it. The scene plan is written first and the artifact is saved
immediately; the build carries on in the background, writing its stage onto the
row, and the player shows the progress. Close it, keep working, come back.

## Two renderer details worth knowing

**The hand never covers the captions.** It enters from the lower right, and
composited over the whole frame it would sit across the caption band and hide
the words, so it is clipped at the band line.

**The hand cutout is generated, then checked.** A cutout with a transparent
background breaks the renderer, which converts to RGB — turning every
transparent pixel black, seeing 99.8% "ink" and putting the marker tip at pixel
(0,0), so the hand would draw with its wrist. The cutout is instead generated once on a solid white background, cached under
`.data/`, and prompted so the marker tip is the extreme upper-left point of the
hand — which is exactly where the renderer looks for it.
