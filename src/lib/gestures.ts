/**
 * The presenter's body language.
 *
 * Azure's standard full-body avatars hold one idle pose until told otherwise.
 * Batch synthesis accepts <bookmark mark='gesture.NAME'/> in the SSML, which
 * starts that gesture at that point in the speech
 * (https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech-avatar/avatar-gestures-with-ssml).
 * Each character and style ships its own set; a name the avatar does not have
 * is not something to try, so everything here is checked against the catalog.
 *
 * Client-safe, like avatars.ts.
 */

export type GestureMode = "auto" | "off";

export type Gesture = { id: string; label: string };

type Catalog = {
  /** Every gesture Microsoft lists for the avatar, for hand-picking. */
  all: string[];
  /** A wave or nod for the first words of the video. */
  greet?: string[];
  /** A thank-you for the last words. */
  thanks?: string[];
  /** For a question put to the learner. */
  ask?: string[];
  /** Open-handed delivery that suits explaining; what "natural variety" rotates through. */
  talk: string[];
};

const nums = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

const CATALOGS: Record<string, Catalog> = {
  "lisa-casual": {
    all: [
      "numeric1-left-1",
      "numeric2-left-1",
      "numeric3-left-1",
      "thumbsup-left-1",
      ...nums("show-front-", 1, 5),
      "think-twice-1",
      ...nums("show-front-", 6, 9),
    ],
    ask: ["think-twice-1"],
    talk: nums("show-front-", 1, 9),
  },
  // Lisa's graceful-sitting and technical-sitting styles leave the service in December 2026.
  "lisa-graceful": {
    all: [
      "wave-left-1",
      "wave-left-2",
      "thumbsup-left",
      ...nums("show-left-", 1, 5),
      ...nums("show-right-", 1, 5),
    ],
    greet: ["wave-left-1", "wave-left-2"],
    talk: [...nums("show-left-", 1, 5), ...nums("show-right-", 1, 5)],
  },
  "lisa-technical": {
    all: [
      "wave-left-1",
      "wave-left-2",
      "show-left-1",
      "show-left-2",
      ...nums("point-left-", 1, 6),
      ...nums("show-right-", 1, 3),
      ...nums("point-right-", 1, 6),
    ],
    greet: ["wave-left-1", "wave-left-2"],
    talk: ["show-left-1", "show-left-2", "show-right-1", "show-right-2", "show-right-3"],
  },
  "lori-casual": {
    all: [
      "123-left",
      "a-little",
      "beg",
      "calm-down",
      "come-on",
      "five-star-reviews",
      "good",
      "hello",
      "open",
      "please",
      "thanks",
    ],
    greet: ["hello"],
    thanks: ["thanks"],
    talk: ["open", "please", "calm-down", "a-little"],
  },
  "lori-graceful": {
    all: [
      "123-left",
      "applaud",
      "come-on",
      "introduce",
      "nod",
      "please",
      "show-left",
      "show-right",
      "thanks",
      "welcome",
    ],
    greet: ["welcome"],
    thanks: ["thanks"],
    talk: ["show-left", "show-right", "introduce", "please"],
  },
  "lori-formal": {
    all: [
      "123",
      "come-on",
      "come-on-left",
      "down",
      "five-star",
      "good",
      "hands-triangle",
      "hands-up",
      "hi",
      "hopeful",
      "thanks",
    ],
    greet: ["hi"],
    thanks: ["thanks"],
    talk: ["hands-triangle", "hands-up", "hopeful", "down"],
  },
  "harry-business": {
    all: [
      "123",
      "calm-down",
      "come-on",
      "five-star-reviews",
      "good",
      "hello",
      "introduce",
      "invite",
      "thanks",
      "welcome",
    ],
    greet: ["hello", "welcome"],
    thanks: ["thanks"],
    talk: ["introduce", "calm-down", "invite"],
  },
  "harry-casual": {
    all: ["123", "come-on", "five-star-reviews", "good", "happy-new-year", "hello", "please", "welcome"],
    greet: ["hello", "welcome"],
    talk: ["please", "come-on"],
  },
  "harry-youthful": {
    all: ["123", "come-on", "down", "five-star", "good", "hello", "invite", "show-right-up-down", "welcome"],
    greet: ["hello", "welcome"],
    talk: ["show-right-up-down", "invite", "down"],
  },
  "max-business": {
    all: [
      "a-little-bit",
      "click-the-link",
      "display-number",
      "encourage-1",
      "encourage-2",
      "five-star-praise",
      "front-right",
      "good-01",
      "good-02",
      ...nums("introduction-to-products-", 1, 3),
      "left",
      "lower-left",
      "number-one",
      "press-both-hands-down-1",
      "press-both-hands-down-2",
      "push-forward",
      "raise-ones-hand",
      "right",
      "say-hi",
      "shrug-ones-shoulders",
      "slide-from-left-to-right",
      "slide-to-the-left",
      "thanks",
      "the-front",
      "top-middle-and-bottom-left",
      "top-middle-and-bottom-right",
      "upper-left",
      "upper-right",
      "welcome",
    ],
    greet: ["welcome", "say-hi"],
    thanks: ["thanks"],
    talk: [
      ...nums("introduction-to-products-", 1, 3),
      "the-front",
      "press-both-hands-down-1",
      "push-forward",
      "encourage-1",
      "encourage-2",
      "front-right",
    ],
  },
  "max-casual": {
    all: [
      "a-little-bit",
      "applaud",
      "click-the-link",
      "display-number",
      "encourage-1",
      "encourage-2",
      "five-star-praise",
      "front-left",
      "good-1",
      "good-2",
      "hello",
      ...nums("introduction-to-products-", 1, 4),
      "left",
      "length",
      "nodding",
      "number-one",
      "press-both-hands-down",
      "raise-ones-hand",
      "right",
      "right-front",
      "shrug-ones-shoulders",
      "slide-from-left-to-right",
      "slide-to-the-left",
      "thanks",
      "the-front",
      "upper-left",
      "upper-right",
      "welcome",
    ],
    greet: ["hello", "welcome"],
    thanks: ["thanks"],
    talk: [
      ...nums("introduction-to-products-", 1, 4),
      "the-front",
      "press-both-hands-down",
      "encourage-1",
      "encourage-2",
      "front-left",
    ],
  },
  "max-formal": {
    all: [
      "a-little-bit",
      "click-the-link",
      "display-number",
      "encourage-1",
      "encourage-2",
      "five-star-praise",
      "front-left",
      "front-right",
      "good-1",
      "good-2",
      ...nums("introduction-to-products-", 1, 3),
      "left",
      "lower-left",
      "lower-right",
      "press-both-hands-down",
      "push-forward",
      "right",
      "say-hi",
      "shrug-ones-shoulders",
      "slide-from-left-to-right",
      "slide-to-the-left",
      "the-front",
      "top-middle-and-bottom-right",
      "upper-left",
      "upper-right",
    ],
    greet: ["say-hi"],
    talk: [
      ...nums("introduction-to-products-", 1, 3),
      "the-front",
      "press-both-hands-down",
      "push-forward",
      "encourage-1",
      "encourage-2",
      "front-left",
      "front-right",
    ],
  },
  "meg-formal": {
    all: [
      "a-little-bit",
      "click-the-link",
      "display-number",
      "encourage-1",
      "encourage-2",
      "five-star-praise",
      "front-left",
      "front-right",
      "good-1",
      "good-2",
      "hands-forward",
      ...nums("introduction-to-products-", 1, 3),
      "left",
      "number-one",
      "press-both-hands-down-1",
      "press-both-hands-down-2",
      "right",
      "say-hi",
      "shrug-ones-shoulders",
      "slide-from-left-to-right",
      "the-front",
      "upper-left",
      "upper-right",
    ],
    greet: ["say-hi"],
    talk: [
      ...nums("introduction-to-products-", 1, 3),
      "the-front",
      "hands-forward",
      "press-both-hands-down-1",
      "encourage-1",
      "encourage-2",
      "front-left",
      "front-right",
    ],
  },
  "meg-casual": {
    all: [
      "a-little-bit",
      "click-the-link",
      "cross-hand",
      "display-number",
      "encourage-1",
      "encourage-2",
      "five-star-praise",
      "front-left",
      "front-right",
      "good-1",
      "good-2",
      "handclap",
      ...nums("introduction-to-products-", 1, 3),
      "left",
      "length",
      "lower-left",
      "lower-right",
      "number-one",
      "press-both-hands-down",
      "right",
      "say-hi",
      "shrug-ones-shoulders",
      "slide-from-right-to-left",
      "slide-to-the-left",
      "spread-hands",
      "the-front",
      "top-middle-and-bottom-left",
      "top-middle-and-bottom-right",
      "upper-left",
      "upper-right",
    ],
    greet: ["say-hi"],
    talk: [
      ...nums("introduction-to-products-", 1, 3),
      "the-front",
      "spread-hands",
      "press-both-hands-down",
      "encourage-1",
      "encourage-2",
      "front-left",
      "front-right",
    ],
  },
  "meg-business": {
    all: [
      "a-little-bit",
      "encourage-1",
      "encourage-2",
      "five-star-praise",
      "front-left",
      "front-right",
      "good-1",
      "good-2",
      ...nums("introduction-to-products-", 1, 3),
      "left",
      "length",
      "number-one",
      "press-both-hands-down-1",
      "press-both-hands-down-2",
      "raise-ones-hand",
      "right",
      "say-hi",
      "shrug-ones-shoulders",
      "slide-from-left-to-right",
      "slide-to-the-left",
      "spread-hands",
      "thanks",
      "the-front",
      "upper-left",
    ],
    greet: ["say-hi"],
    thanks: ["thanks"],
    talk: [
      ...nums("introduction-to-products-", 1, 3),
      "the-front",
      "spread-hands",
      "press-both-hands-down-1",
      "encourage-1",
      "encourage-2",
      "front-left",
      "front-right",
    ],
  },
};

const LABELS: Record<string, string> = {
  "123": "Count one, two, three",
  "123-left": "Count one, two, three (left hand)",
  "numeric1-left-1": "Number one (left hand)",
  "numeric2-left-1": "Number two (left hand)",
  "numeric3-left-1": "Number three (left hand)",
  "thumbsup-left-1": "Thumbs up (left hand)",
  "thumbsup-left": "Thumbs up (left hand)",
  "think-twice-1": "Think it over",
  "five-star": "Five stars",
  "five-star-reviews": "Five stars",
  "five-star-praise": "Five stars",
  "raise-ones-hand": "Raise a hand",
  "shrug-ones-shoulders": "Shrug",
  "say-hi": "Say hi",
  "number-one": "Number one",
};

const humanize = (id: string) => {
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Gestures the presenter can be told to perform; empty for avatars Microsoft lists none for. */
export function gestureCatalog(presenterKey: string | undefined): Gesture[] {
  return (CATALOGS[presenterKey ?? ""]?.all ?? []).map((id) => ({ id, label: LABELS[id] ?? humanize(id) }));
}

export const hasGestures = (presenterKey: string | undefined) => Boolean(CATALOGS[presenterKey ?? ""]);

export const GESTURE_NONE = "none";

/** A section's chosen gesture: "none", a gesture this presenter has, or nothing (follow the video). */
export function sectionGesture(presenterKey: string | undefined, value: unknown): string | undefined {
  if (value === GESTURE_NONE) return GESTURE_NONE;
  if (typeof value !== "string") return undefined;
  return CATALOGS[presenterKey ?? ""]?.all.includes(value) ? value : undefined;
}

/** Looser than sectionGesture: shape only, because the presenter can change after the pick is saved. */
export function cleanGesture(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z0-9-]{1,48}$/.test(value) ? value : undefined;
}

export const gestureMode = (value: unknown): GestureMode => (value === "auto" ? "auto" : "off");

export type BodyLanguage = {
  presenter: string;
  mode: GestureMode;
  /** The section's own pick, if any. */
  gesture?: string;
  /** Where this section sits in the whole video, so the opening and the close can be marked. */
  index: number;
  count: number;
};

/** The sentences of a paragraph, split the way a speaker would phrase them. */
export function paragraphSentences(paragraph: string): string[] {
  return paragraph
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…]["'”’)\]]*)\s+(?=["'“‘(\[]?[\p{Lu}\p{N}])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A gesture is rarely under three seconds, so a phrase this short is left alone. */
const MIN_WORDS = 7;
const UNIT_SENTENCES = 2;

export type SpeechUnit = { text: string; paragraphStart: boolean };

/**
 * Split a section into the phrases a gesture can start at: each paragraph, in
 * runs of two sentences.
 */
export function speechUnits(text: string): SpeechUnit[] {
  const out: SpeechUnit[] = [];
  for (const p of text.split(/\n\s*\n/)) {
    const sentences = paragraphSentences(p);
    for (let i = 0; i < sentences.length; i += UNIT_SENTENCES) {
      out.push({ text: sentences.slice(i, i + UNIT_SENTENCES).join(" "), paragraphStart: i === 0 });
    }
  }
  return out;
}

/**
 * Which gesture, if any, starts at each unit. Pure in its inputs, so a section
 * keeps its gestures — and its cached presenter clip — until its own words,
 * pick or presenter change.
 */
export function planGestures(units: SpeechUnit[], b: BodyLanguage): (string | null)[] {
  const plan: (string | null)[] = units.map(() => null);
  const cat = CATALOGS[b.presenter];
  if (!cat || !units.length) return plan;
  const own = sectionGesture(b.presenter, b.gesture);
  if (own === GESTURE_NONE) return plan;
  if (own) plan[0] = own;
  if (b.mode !== "auto") return plan;

  let last = own ?? null;
  let turn = b.index * 3;
  units.forEach((u, k) => {
    if (plan[k]) return;
    if (u.text.match(/\S+/g)!.length < MIN_WORDS) return;
    let pick: string | undefined;
    if (k === 0 && b.index === 0) pick = cat.greet?.[0];
    else if (k === units.length - 1 && b.index === b.count - 1) pick = cat.thanks?.[0];
    else if (/\?$/.test(u.text) && cat.ask?.length) pick = cat.ask[turn++ % cat.ask.length];
    // Every third phrase is left to the idle pose, so the hands settle between gestures.
    else if ((k + b.index) % 3 !== 2) {
      pick = cat.talk[turn++ % cat.talk.length];
      if (pick === last && cat.talk.length > 1) pick = cat.talk[turn++ % cat.talk.length];
    }
    if (pick) {
      plan[k] = pick;
      last = pick;
    }
  });
  return plan;
}

export const gestureBookmark = (id: string) => `<bookmark mark='gesture.${id}'/>`;
