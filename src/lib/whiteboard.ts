/**
 * Whiteboard videos: a scene plan grounded in the notebook, drawn as artwork,
 * narrated, and rendered to MP4.
 *
 * Adapted from the Whiteboard skill, which expects host image and speech tools
 * that this app does not have. It has its own image model and Speech voices
 * already configured, so those are used instead and the bundled Python
 * renderer is kept.
 */

export const WHITEBOARD_STYLE =
  "Whiteboard explainer illustration on a clean pure white background, no hand, " +
  "no marker, no person drawing. Style: simple black marker line cartoon doodles " +
  "with light blue and orange marker accents, whiteboard explainer animation style, " +
  "flat even lighting, wide landscape composition, generous white space, nothing in " +
  "the lower right corner.";

/** Prompt for the hand cutout. Generated once and reused across every video. */
export const HAND_PROMPT =
  "Photorealistic top-down photograph of a human hand holding a plain unbranded " +
  "black dry-erase marker as if drawing on a whiteboard. The hand enters from the " +
  "lower right corner. The marker tip points toward the upper left and is the single " +
  "furthest upper-left object in the frame, touching the drawing plane, cap off. The " +
  "marker barrel is plain matte black with no text, no logo, no label, no brand name " +
  "and no markings of any kind. Isolated on a solid opaque pure white background " +
  "filling the entire frame. Natural skin texture, soft even studio lighting, no " +
  "shadow on the background, no other objects, no text anywhere.";

export type Scene = {
  /** 2-4 words, hand-lettered at the top of the drawing. */
  title: string;
  /** One picture, described for the image model. */
  drawing: string;
  /** Shown in the band under the artwork; one line. */
  caption: string;
  /** Spoken over this scene; 1-2 sentences. */
  narration: string;
  /** Step number drawn in a circle, when the scene is a numbered step. */
  step?: number;
};

export type ScenePlan = { title: string; description: string; scenes: Scene[] };

export const SCENE_COUNT = 6;

export const PLAN_INSTRUCTION = (topic: string) => `You are a scriptwriter for whiteboard explainer videos — the kind where a hand
draws simple marker doodles while a narrator explains.

Plan a ${SCENE_COUNT}-scene video from the sources${topic ? `, focused on: ${topic}` : ""}.
Respond with a single JSON object only. No markdown fences, no commentary.

Schema:
{
  "title": string,        // <= 60 chars, names the subject concretely
  "description": string,  // one sentence on what a viewer will learn
  "scenes": [{
    "title": string,      // 2-4 WORDS, upper case, lettered on the whiteboard
    "drawing": string,    // one picture: 1-3 cartoon objects or characters
    "caption": string,    // <= 70 chars, shown under the artwork
    "narration": string,  // 1-2 sentences, 8-12 seconds spoken
    "step": number        // 1,2,3... on step scenes only; omit elsewhere
  }]
}

STRUCTURE
1. Opening — the subject and why it is worth knowing. No step number.
2-5. One distinct idea each, numbered as steps.
6. Closing — the single thing worth remembering. No step number.

THE DRAWING
Each "drawing" is ONE simple picture a person could sketch with a marker in
fifteen seconds: at most three objects or cartoon characters, no scenery, no
crowds, no text. Describe what is drawn, not what it means — "a cartoon battery
half full next to a small clock" rather than "an illustration of energy over
time". Prefer a concrete object from the sources over an abstract symbol.

Never name a real brand, logo, product mark, trademarked character or real
person. Use a generic stand-in: an envelope, a document, a robot, a gear.

THE TITLE ON THE BOARD
Two to four words, upper case, and it will be hand-lettered — long titles come
out misspelled. "WHY IT MATTERS", "PICK A MODEL", "WHAT IT COSTS".

THE CAPTION
A full short sentence, under 70 characters, readable while the narrator speaks.
It is not the title repeated.

THE NARRATION
Warm and conversational, plain language, contractions throughout. One or two
sentences per scene — about 8 to 12 seconds spoken. Start step scenes with
"Step N." Close on the point, not a sign-off. No markdown, no citation markers,
no stage directions: every character is read aloud.

Ground every claim in the excerpts. If the sources do not support a scene, cover
what they do support rather than inventing it.`;

/** The full prompt handed to the image model for one scene. */
export function scenePrompt(scene: Scene): string {
  const step = scene.step
    ? ` A big number "${scene.step}" in a circle at the top left.`
    : "";
  return (
    `${WHITEBOARD_STYLE} Drawing: ${scene.drawing}.${step} ` +
    `Hand-lettered marker title at the top reading exactly "${scene.title}", no other words.`
  );
}
