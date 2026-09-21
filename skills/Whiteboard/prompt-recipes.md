# Prompt recipes for whiteboard-video

## Style descriptor (repeat verbatim in every scene prompt)

> Whiteboard explainer illustration on a clean pure white background, no hand, no marker, no person drawing.
> Style: simple black marker line cartoon doodles with light blue and orange marker accents, whiteboard explainer
> animation style, flat even lighting, wide landscape composition, generous white space, nothing in the lower right corner.

## Scene prompt template

```
<STYLE DESCRIPTOR>. Drawing: <one cartoon picture that illustrates the idea, 1–3 objects/characters>.
[A big number "<N>" in a circle at the top left.]
Hand-lettered marker title at the top reading exactly "<3–4 WORD TITLE>", no other words.
```

Rules: one short title per scene (long hand-lettered text misspells); any in-picture text goes in quotes with
"and nothing else"; never real brand logos or trademarked characters — generic icons (envelope, calendar, document).

## Hand cutout prompt (generate once, reuse)

> Photorealistic top-down photo of a real human hand holding a black dry-erase marker as if drawing on a whiteboard,
> isolated on a pure solid white background. The hand enters from the lower right corner of the frame, the marker tip
> points toward the upper left and touches the paper plane, marker cap off. Natural skin texture, soft even studio
> lighting, no shadow on the background, no other objects, no text.

The build script finds the marker tip automatically as the upper-left-most non-white pixel, so the tip must be the
extreme upper-left point of the cutout.

## Default scene structure (6–8 scenes)

1. Title — friendly mascot + the topic's main object
2. What it is / why it matters
3–6. Numbered steps or key points (one idea each)
7. Pro tips — lightbulb + three small doodles
8. Closing — celebration / high five

## Narration style

Warm, conversational, plain language, no jargon. 1–2 sentences per scene (~8–12 s spoken). Start each step with
"Step N: <title>." Close upbeat. Keep every clip under 12 s so no scene drags.

## Example config.json

```json
{
  "output": "working/topic-whiteboard-narrated.mp4",
  "hand": "working/hand-marker.png",
  "art_height": 820,
  "scenes": [
    {"image": "working/scene-01.png", "caption": "How to X - a quick guide", "audio": "working/narration-01.mp3"},
    {"image": "working/scene-02.png", "caption": "Step 1 - ...", "audio": "working/narration-02.mp3"}
  ]
}
```
