import { SPEAKER_IDS, VOICE_PRESETS, type SpeakerId } from "@/lib/voices";

/** The formats that are spoken aloud and so take instructions and music. */
export const SPOKEN = ["podcast", "video", "motion", "training"] as const;
export type SpokenType = (typeof SPOKEN)[number];
/** The spoken formats that render a video and so can carry a watermark. */
export type VideoType = Exclude<SpokenType, "podcast">;
export const spokenRecord = <T,>(v: T): Record<SpokenType, T> => ({
  podcast: v,
  video: v,
  motion: v,
  training: v,
});

/** How the dialogue is rendered: voice family plus pause shaping. */
export type Delivery = "natural" | "even" | "pinned";
export type SpeakerConfig = {
  id: SpeakerId;
  voice: string;
  name: string;
  role: string;
};
export type EpisodeProfile = {
  key: string;
  label: string;
  speakers: Omit<SpeakerConfig, "id" | "voice">[];
};

export const EPISODE_PROFILES: EpisodeProfile[] = [
  {
    key: "deep-dive",
    label: "Deep dive (2 hosts)",
    speakers: [
      {
        name: "",
        role: "curious host who drives the conversation and asks questions",
      },
      { name: "", role: "analyst who explains the details and implications" },
    ],
  },
  {
    key: "solo",
    label: "Solo explainer (1)",
    speakers: [
      {
        name: "Narrator",
        role: "clear, curious narrator who explains the material directly",
      },
    ],
  },
  {
    key: "expert-panel",
    label: "Expert panel (3: host + two experts)",
    speakers: [
      {
        name: "Host",
        role: "moderator who frames the questions and keeps the pace",
      },
      {
        name: "Technical expert",
        role: "technical expert who explains mechanisms and tradeoffs",
      },
      {
        name: "Policy expert",
        role: "domain expert who explains consequences and caveats",
      },
    ],
  },
  {
    key: "debate",
    label: "Debate (4: moderator + 2 sides + fact-checker)",
    speakers: [
      {
        name: "Moderator",
        role: "moderator who keeps the discussion grounded",
      },
      {
        name: "Advocate",
        role: "optimistic advocate who argues for the strongest upside",
      },
      {
        name: "Skeptic",
        role: "skeptical challenger who tests assumptions and risks",
      },
      {
        name: "Fact-checker",
        role: "fact-checker who resolves claims against the sources",
      },
    ],
  },
];

export const profileSpeakers = (key: string): SpeakerConfig[] => {
  const profile =
    EPISODE_PROFILES.find((p) => p.key === key) ?? EPISODE_PROFILES[0]!;
  return profile.speakers.map((s, i) => {
    const id = SPEAKER_IDS[i] ?? "a";
    return {
      id,
      voice: VOICE_PRESETS.conversational[id],
      ...s,
    };
  });
};
