/**
 * Presenter configuration shared by the API and the UI.
 *
 * Kept apart from avatarbatch.ts for the same reason voices.ts is kept apart
 * from speech.ts: that module pulls in the Azure identity SDK, which has no
 * business in a client bundle.
 */
import { PINNED_VOICES } from "./voices";

export type AvatarPreset = {
  label: string;
  /** Standard avatar character, as the batch API spells it. */
  character: string;
  style: string;
  /** A PINNED_VOICES speaker that suits the presenter. */
  voice: string;
};

/**
 * Standard full-body video avatars suited to a seated or standing trainer.
 *
 * Jeff is deliberately absent: Microsoft retires that avatar in December
 * 2026, and a saved transcript pointing at it would stop rendering.
 */
export const AVATAR_PRESETS: Record<string, AvatarPreset> = {
  "lisa-casual": {
    label: "Lisa · casual, seated",
    character: "lisa",
    style: "casual-sitting",
    voice: "Ava",
  },
  "lisa-technical": {
    label: "Lisa · technical, seated",
    character: "lisa",
    style: "technical-sitting",
    voice: "Ava",
  },
  "lori-formal": {
    label: "Lori · formal",
    character: "lori",
    style: "formal",
    voice: "Emma",
  },
  "meg-business": {
    label: "Meg · business",
    character: "meg",
    style: "business",
    voice: "Jenny",
  },
  "harry-casual": {
    label: "Harry · casual",
    character: "harry",
    style: "casual",
    voice: "Andrew",
  },
  "max-business": {
    label: "Max · business",
    character: "max",
    style: "business",
    voice: "Brian",
  },
  "max-casual": {
    label: "Max · casual",
    character: "max",
    style: "casual",
    voice: "Davis",
  },
};

export const DEFAULT_PRESENTER = "lisa-casual";

export function presenter(key?: string): { key: string; preset: AvatarPreset } {
  const k = key && AVATAR_PRESETS[key] ? key : DEFAULT_PRESENTER;
  return { key: k, preset: AVATAR_PRESETS[k] };
}

/** Voices a presenter can speak with: the standalone neural voices. */
export const PRESENTER_VOICES = Object.keys(PINNED_VOICES);

export function presenterVoice(name?: string, fallback = "Ava"): string {
  const match = PRESENTER_VOICES.find(
    (v) => v.toLowerCase() === (name ?? "").toLowerCase()
  );
  return match ?? fallback;
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
