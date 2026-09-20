/**
 * Voice configuration shared by the API and the UI.
 *
 * Kept separate from speech.ts because that module pulls in the Azure identity
 * SDK, which has no business in a client bundle.
 */

export type VoicePair = { a: string; b: string; multitalker: boolean };

/**
 * Speakers the multitalker voice accepts, from the en-US DragonHD set.
 *
 * Validated rather than passed through: an unrecognised name does not error,
 * it silently renders in some other voice, so a typo would be invisible.
 */
export const MULTITALKER_SPEAKERS = {
  female: [
    "Ava",
    "Aria",
    "Bree",
    "Emma",
    "Evelyn",
    "Jane",
    "Jenny",
    "Mila",
    "Nova",
    "Paige",
    "Phoebe",
    "Serena",
    "Tessa",
    "Tiana",
  ],
  male: [
    "Adam",
    "Alloy",
    "Andrew",
    "Brian",
    "Colin",
    "Davis",
    "Jimmie",
    "Juno",
    "Steffan",
    "Tyler",
    "Vance",
  ],
} as const;

export const ALL_SPEAKERS: string[] = [
  ...MULTITALKER_SPEAKERS.female,
  ...MULTITALKER_SPEAKERS.male,
];

export const VOICE_PRESETS: Record<string, VoicePair> = {
  // Azure's purpose-built multi-speaker voice: one request renders a whole
  // exchange, so turn-to-turn prosody actually sounds like a conversation.
  conversational: { a: "Andrew", b: "Ava", multitalker: true },
  warm: { a: "Davis", b: "Emma", multitalker: true },
  bright: { a: "Tyler", b: "Nova", multitalker: true },
  measured: { a: "Steffan", b: "Serena", multitalker: true },
  classic: {
    a: "en-US-AndrewMultilingualNeural",
    b: "en-US-AvaMultilingualNeural",
    multitalker: false,
  },
};

/**
 * Playback speed. Measured against the multitalker voice: 0.8 lengthened a
 * sample by about a third and 1.25 shortened it, so the control is effective
 * on both voice families.
 */
export const MIN_RATE = 0.7;
export const MAX_RATE = 1.3;
export const RATE_CHOICES = [0.8, 0.9, 1, 1.1, 1.25];

export function resolveVoices(preset?: string, custom?: Partial<VoicePair>): VoicePair {
  const base = VOICE_PRESETS[preset ?? "conversational"] ?? VOICE_PRESETS.conversational;
  if (!custom?.a && !custom?.b) return base;

  const pick = (name: string | undefined, fallback: string) => {
    if (!name) return fallback;
    if (!base.multitalker) return name; // full voice names are not a fixed set
    const match = ALL_SPEAKERS.find((s) => s.toLowerCase() === name.toLowerCase());
    if (!match) {
      throw new Error(
        `"${name}" is not a valid speaker. Choose one of: ${ALL_SPEAKERS.join(", ")}.`
      );
    }
    return match;
  };

  return { ...base, a: pick(custom.a, base.a), b: pick(custom.b, base.b) };
}

export function clampRate(rate?: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate as number));
}

/**
 * Speaking rate, measured rather than assumed: 2,261 words across 14.0 minutes
 * of generated overviews came to 161 words per minute, consistently across
 * three separate notebooks. Target word counts below are derived from it.
 */
export const WORDS_PER_MINUTE = 161;

export type AudioLength = "short" | "medium" | "long";

export const AUDIO_LENGTHS: Record<
  AudioLength,
  { label: string; minutes: number; words: number; turns: [number, number] }
> = {
  // Turn ranges follow from the word budget at roughly 38 words a turn, which
  // is what the existing overviews averaged.
  short: { label: "Short", minutes: 3, words: 480, turns: [12, 16] },
  medium: { label: "Medium", minutes: 6, words: 970, turns: [22, 28] },
  long: { label: "Long", minutes: 10, words: 1610, turns: [36, 44] },
};

export function audioLength(key?: string): AudioLength {
  return key === "short" || key === "long" ? key : "medium";
}
