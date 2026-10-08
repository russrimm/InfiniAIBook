/**
 * Voice configuration shared by the API and the UI.
 *
 * Kept separate from speech.ts because that module pulls in the Azure identity
 * SDK, which has no business in a client bundle.
 */

export const SPEAKER_IDS = ["a", "b", "c", "d"] as const;
export type SpeakerId = (typeof SPEAKER_IDS)[number];
export type VoiceMap = Record<SpeakerId, string>;
export type VoicePair = Pick<VoiceMap, "a" | "b"> & { multitalker: boolean };
export type VoiceSelection = VoiceMap & { multitalker: boolean };

/**
 * Speakers the multitalker voice accepts, from the en-US DragonHD set.
 *
 * Validated rather than passed through: an unrecognized name does not error,
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

export const VOICE_PRESETS: Record<string, VoiceSelection> = {
  // Azure's purpose-built multi-speaker voice: one request renders a whole
  // exchange, so turn-to-turn prosody actually sounds like a conversation.
  conversational: {
    a: "Andrew",
    b: "Ava",
    c: "Brian",
    d: "Emma",
    multitalker: true,
  },
  warm: { a: "Davis", b: "Emma", c: "Andrew", d: "Serena", multitalker: true },
  bright: { a: "Tyler", b: "Nova", c: "Brian", d: "Phoebe", multitalker: true },
  measured: {
    a: "Steffan",
    b: "Serena",
    c: "Adam",
    d: "Jane",
    multitalker: true,
  },
  classic: {
    a: "en-US-AndrewMultilingualNeural",
    b: "en-US-AvaMultilingualNeural",
    c: "en-US-BrianMultilingualNeural",
    d: "en-US-EmmaMultilingualNeural",
    multitalker: false,
  },
};

/**
 * Speakers that also exist as standalone voices.
 *
 * The multitalker renders a whole dialogue from one generative model and takes
 * the speaker name as *conditioning*, not as a selection — so a voice can
 * wander within a turn. Naming a standalone voice instead pins the exact model
 * for that turn, which cannot drift. Only these fifteen of the twenty-five
 * speaker names have one; the rest exist only inside the multitalker.
 */
export const PINNED_VOICES: Record<string, string> = {
  Ava: "en-US-AvaMultilingualNeural",
  Aria: "en-US-AriaNeural",
  Emma: "en-US-EmmaMultilingualNeural",
  Evelyn: "en-US-EvelynMultilingualNeural",
  Jane: "en-US-JaneNeural",
  Jenny: "en-US-JennyMultilingualNeural",
  Phoebe: "en-US-PhoebeMultilingualNeural",
  Serena: "en-US-SerenaMultilingualNeural",
  Adam: "en-US-AdamMultilingualNeural",
  Andrew: "en-US-AndrewMultilingualNeural",
  Brian: "en-US-BrianMultilingualNeural",
  Davis: "en-US-DavisMultilingualNeural",
  Steffan: "en-US-SteffanMultilingualNeural",
  // Dragon HD standalone voices: higher quality, but only in regions that host Dragon HD.
  // Tiana, Tyler and Jimmie are left out on purpose: their Flash edition runs only in eastus,
  // westeurope and southeastasia, so pinning them would fail in other regions.
  Nova: "en-US-Nova:DragonHDLatestNeural",
  Alloy: "en-US-Alloy:DragonHDLatestNeural",
};

export const canPin = (speaker: string): boolean => speaker in PINNED_VOICES;

/**
 * Dragon HD versions of pinned voices, where Microsoft lists one. Offered only
 * when the live voice list shows the Speech resource's region hosts it.
 */
export const HD_VARIANTS: Record<string, string> = {
  Ava: "en-US-Ava:DragonHDLatestNeural",
  Aria: "en-US-Aria:DragonHDLatestNeural",
  Emma: "en-US-Emma:DragonHDLatestNeural",
  Jenny: "en-US-Jenny:DragonHDLatestNeural",
  Phoebe: "en-US-Phoebe:DragonHDLatestNeural",
  Serena: "en-US-Serena:DragonHDLatestNeural",
  Adam: "en-US-Adam:DragonHDLatestNeural",
  Andrew: "en-US-Andrew:DragonHDLatestNeural",
  Brian: "en-US-Brian:DragonHDLatestNeural",
  Davis: "en-US-Davis:DragonHDLatestNeural",
  Steffan: "en-US-Steffan:DragonHDLatestNeural",
};

/**
 * Dragon HD Omni name for any released voice: the same persona with the
 * `:DragonHDOmniLatestNeural` suffix (Microsoft's HD voices page). It covers
 * voices with no DragonHD edition, such as Evelyn and Jane.
 */
export const omniVoice = (pinned: string): string => {
  const m = /^(.+?)(?:Multilingual)?Neural$/.exec(pinned.split(":")[0]);
  return `${m ? m[1] : pinned}:DragonHDOmniLatestNeural`;
};

/** HD ids to try for a speaker, best first: DragonHD, then Dragon HD Omni. */
export const hdCandidates = (speaker: string): string[] => {
  const pinned = PINNED_VOICES[speaker];
  if (!pinned) return [];
  const ids = [HD_VARIANTS[speaker], omniVoice(pinned)].filter(Boolean);
  return pinned.includes(":")
    ? [pinned, ...ids.filter((x) => x !== pinned)]
    : ids;
};
/**
 * Dragon HD editions tuned for a use, listed on Microsoft's HD voices page.
 * The podcast ones are in preview. Offered only when the live list has them.
 */
export const HD_ALTERNATES: Record<string, { id: string; label: string }[]> = {
  Andrew: [
    { id: "en-US-Andrew2:DragonHDLatestNeural", label: "conversational" },
    { id: "en-US-Andrew3:DragonHDLatestNeural", label: "podcast" },
  ],
  Emma: [{ id: "en-US-Emma2:DragonHDLatestNeural", label: "conversational" }],
  Ava: [{ id: "en-US-Ava3:DragonHDLatestNeural", label: "podcast" }],
};
/** Gender of each pinned voice, as listed in Microsoft's Speech language support table. */
export const PINNED_GENDER: Record<string, "Female" | "Male"> = {
  Ava: "Female",
  Aria: "Female",
  Emma: "Female",
  Evelyn: "Female",
  Jane: "Female",
  Jenny: "Female",
  Phoebe: "Female",
  Nova: "Female",
  Tiana: "Female",
  Serena: "Female",
  Adam: "Male",
  Andrew: "Male",
  Brian: "Male",
  Davis: "Male",
  Steffan: "Male",
  Alloy: "Male",
  Tyler: "Male",
  Jimmie: "Male",
};

/**
 * Playback speed. Measured against the multitalker voice: 0.8 lengthened a
 * sample by about a third and 1.25 shortened it, so the control is effective
 * on both voice families.
 */
export const MIN_RATE = 0.7;
export const MAX_RATE = 1.3;
export const RATE_CHOICES = [0.8, 0.9, 1, 1.1, 1.25];

export function resolveVoices(
  preset?: string,
  custom?: Partial<Record<SpeakerId, string>>,
  speakerCount = 2,
): VoiceSelection {
  const base =
    VOICE_PRESETS[preset ?? "conversational"] ?? VOICE_PRESETS.conversational;
  const activeIds = SPEAKER_IDS.slice(
    0,
    Math.min(4, Math.max(1, speakerCount)),
  );

  // Pinned mode: the chosen hosts are rendered as standalone voices rather
  // than as speaker names inside the multitalker, so identity cannot wander.
  if (!base.multitalker && activeIds.some((id) => custom?.[id])) {
    const pin = (name: string | undefined, fallback: string) => {
      if (!name) return fallback;
      if (PINNED_VOICES[name]) return PINNED_VOICES[name];
      // Already a full voice name.
      if (/^[a-z]{2}-[A-Z]{2}-/.test(name)) return name;
      throw new Error(
        `"${name}" has no standalone voice, so it cannot be used with fixed voices. Pick one of: ${Object.keys(
          PINNED_VOICES,
        ).join(", ")}.`,
      );
    };
    return {
      multitalker: false,
      a: pin(custom?.a, base.a),
      b: pin(custom?.b, base.b),
      c: pin(custom?.c, base.c),
      d: pin(custom?.d, base.d),
    };
  }

  if (!activeIds.some((id) => custom?.[id])) return base;

  const pick = (name: string | undefined, fallback: string) => {
    if (!name) return fallback;
    if (!base.multitalker) return name; // full voice names are not a fixed set
    const match = ALL_SPEAKERS.find(
      (s) => s.toLowerCase() === name.toLowerCase(),
    );
    if (!match) {
      throw new Error(
        `"${name}" is not a valid speaker. Choose one of: ${ALL_SPEAKERS.join(", ")}.`,
      );
    }
    return match;
  };

  return {
    ...base,
    a: pick(custom?.a, base.a),
    b: pick(custom?.b, base.b),
    c: pick(custom?.c, base.c),
    d: pick(custom?.d, base.d),
  };
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
