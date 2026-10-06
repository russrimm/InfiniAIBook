/**
 * Presenter configuration shared by the API and the UI.
 *
 * Kept apart from avatarbatch.ts for the same reason voices.ts is kept apart
 * from speech.ts: that module pulls in the Azure identity SDK, which has no
 * business in a client bundle.
 */
import { PINNED_VOICES } from "./voices";
import { isVoiceId } from "./voicecatalog";

export type AvatarPreset = {
  label: string;
  /** Standard avatar character, as the batch API spells it. */
  character: string;
  /** Omitted for characters Microsoft lists without a style. */
  style?: string;
  /** A PINNED_VOICES speaker that suits the presenter. */
  voice: string;
};

/**
 * Every standard full-body video avatar Microsoft lists for batch synthesis
 * (https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech-avatar/standard-avatars),
 * one entry per character and style.
 *
 * Keys of the first seven are saved in transcripts, so they never change.
 * The talking-head (photo) avatars are not offered: they render head-only at
 * 512x512 through a different model, and the training compositor lays a
 * transparent full-body presenter over the slides.
 *
 * Jeff is absent because Microsoft retires him in December 2026 and no longer
 * lists his styles.
 */
export const AVATAR_PRESETS: Record<string, AvatarPreset> = {
  "lisa-casual": { label: "Lisa · casual, seated", character: "lisa", style: "casual-sitting", voice: "Ava" },
  "lisa-technical": { label: "Lisa · technical, seated", character: "lisa", style: "technical-sitting", voice: "Ava" },
  "lisa-graceful": { label: "Lisa · graceful, seated", character: "lisa", style: "graceful-sitting", voice: "Ava" },
  "lisa-graceful-standing": { label: "Lisa · graceful, standing", character: "lisa", style: "graceful-standing", voice: "Ava" },
  "lisa-technical-standing": { label: "Lisa · technical, standing", character: "lisa", style: "technical-standing", voice: "Ava" },
  "lori-formal": { label: "Lori · formal", character: "lori", style: "formal", voice: "Emma" },
  "lori-casual": { label: "Lori · casual", character: "lori", style: "casual", voice: "Emma" },
  "lori-graceful": { label: "Lori · graceful", character: "lori", style: "graceful", voice: "Emma" },
  "meg-business": { label: "Meg · business", character: "meg", style: "business", voice: "Jenny" },
  "meg-formal": { label: "Meg · formal", character: "meg", style: "formal", voice: "Jenny" },
  "meg-casual": { label: "Meg · casual", character: "meg", style: "casual", voice: "Jenny" },
  "harry-casual": { label: "Harry · casual", character: "harry", style: "casual", voice: "Andrew" },
  "harry-business": { label: "Harry · business", character: "harry", style: "business", voice: "Andrew" },
  "harry-youthful": { label: "Harry · youthful", character: "harry", style: "youthful", voice: "Andrew" },
  "max-business": { label: "Max · business", character: "max", style: "business", voice: "Brian" },
  "max-casual": { label: "Max · casual", character: "max", style: "casual", voice: "Davis" },
  "max-formal": { label: "Max · formal", character: "max", style: "formal", voice: "Brian" },
  // Styleless characters: Microsoft lists no style for these, so none is sent.
  rowan: { label: "Rowan", character: "rowan", voice: "Adam" },
  celine: { label: "Celine", character: "celine", voice: "Serena" },
  nia: { label: "Nia", character: "nia", voice: "Evelyn" },
  malik: { label: "Malik", character: "malik", voice: "Steffan" },
};
export const DEFAULT_PRESENTER = "lisa-casual";

export function presenter(key?: string): { key: string; preset: AvatarPreset } {
  const k = key && AVATAR_PRESETS[key] ? key : DEFAULT_PRESENTER;
  return { key: k, preset: AVATAR_PRESETS[k] };
}

/** Voices a presenter can speak with: the standalone neural voices. */
export const PRESENTER_VOICES = Object.keys(PINNED_VOICES);

/**
 * A stored voice is either a pinned speaker name (Ava) or a full service name
 * (en-US-JennyNeural) chosen from the live list.
 */
export function presenterVoice(name?: string, fallback = "Ava"): string {
  const match = PRESENTER_VOICES.find(
    (v) => v.toLowerCase() === (name ?? "").toLowerCase()
  );
  return match ?? (isVoiceId(name) ? name : fallback);
}

export const BACKGROUNDS: { label: string; value: string }[] = [
  { label: "Studio slate", value: "#1F2A37" },
  { label: "Deep navy", value: "#0F2744" },
  { label: "Soft grey", value: "#E5E7EB" },
  { label: "Warm white", value: "#F7F4EE" },
  { label: "Forest", value: "#17352B" },
];

export const DEFAULT_BACKGROUND = BACKGROUNDS[0].value;

export function backgroundColour(v?: string): string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)
    ? v.toUpperCase()
    : DEFAULT_BACKGROUND;
}

/**
 * The batch service cuts a single video off at 20 minutes, so a script that
 * would run past it is refused before anything is billed.
 */
export const MAX_AVATAR_MINUTES = 20;
