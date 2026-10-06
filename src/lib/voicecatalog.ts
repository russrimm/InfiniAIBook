/**
 * Voices a presenter can speak with, beyond the thirteen pinned speakers.
 *
 * Client-safe on purpose (see voices.ts): the live list is fetched by
 * voicelist.ts on the server and served from /api/voices.
 */
import { PINNED_VOICES } from "./voices";

export type CatalogVoice = {
  /** Service short name, e.g. en-US-JennyNeural. */
  id: string;
  /** Display name, e.g. "Jenny Multilingual". */
  name: string;
  gender: string;
  /** express-as styles this voice declares and that measurably change delivery. */
  styles: string[];
  /** Dragon HD voices. */
  hd?: boolean;
  preview?: boolean;
};

/** A full voice short name, optionally with a model suffix (Ava:DragonHDLatestNeural). */
export const VOICE_ID_RE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+(?::[A-Za-z0-9.-]+)?$/;
export const STYLE_RE = /^[a-z][a-z-]{1,39}$/;

export const isVoiceId = (v: unknown): v is string => typeof v === "string" && VOICE_ID_RE.test(v);

export const cleanStyle = (s: unknown): string | undefined =>
  typeof s === "string" && STYLE_RE.test(s) ? s : undefined;

/** The service name for a stored voice: a pinned speaker key or a full short name. */
export function voiceServiceName(voice: string | undefined, fallback = PINNED_VOICES.Ava): string {
  if (voice && PINNED_VOICES[voice]) return PINNED_VOICES[voice];
  return isVoiceId(voice) ? voice : fallback;
}

/**
 * Styles measured to leave the audio unchanged (same duration as the neutral
 * read, where duration is deterministic). They are declared by the service but
 * do nothing, so they are not offered.
 */
const NO_EFFECT: Record<string, string[]> = {
  "en-US-TonyNeural": ["unfriendly"],
  "en-US-DavisNeural": ["unfriendly"],
  "en-US-JaneNeural": ["whispering"],
  "en-US-Harper:MAI-Voice-2": ["excited"],
};

export function usableStyles(id: string, declared: string[] | undefined): string[] {
  const skip = NO_EFFECT[id] ?? [];
  return [...new Set((declared ?? []).filter((s) => STYLE_RE.test(s) && !skip.includes(s)))];
}

/** A short, readable name for a stored voice: "Ava", or "Jenny" from en-US-JennyNeural. */
export function voiceNickname(voice: string): string {
  if (PINNED_VOICES[voice]) return voice;
  if (!isVoiceId(voice)) return voice;
  const bare = voice.replace(/^[a-z]{2,3}-[A-Z]{2}-/, "").replace(/:.*$/, "");
  return bare.replace(/(Multilingual)?(Turbo)?Neural$/, "$1$2").replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** What the picker shows when the live list is unavailable. */
export const BASELINE_VOICES: CatalogVoice[] = Object.entries(PINNED_VOICES).map(([key, id]) => ({
  id,
  name: key,
  gender: "",
  styles: [],
}));

export type VoiceGroup = { label: string; voices: CatalogVoice[] };

export function groupVoices(voices: CatalogVoice[]): VoiceGroup[] {
  const byName = (a: CatalogVoice, b: CatalogVoice) => a.name.localeCompare(b.name);
  const styled = voices.filter((v) => v.styles.length && !v.preview).sort(byName);
  const preview = voices.filter((v) => v.preview).sort(byName);
  const hd = voices.filter((v) => !v.styles.length && v.hd && !v.preview).sort(byName);
  const rest = voices.filter((v) => !v.styles.length && !v.hd && !v.preview).sort(byName);
  return [
    { label: "With speaking styles", voices: styled },
    { label: "Standard voices", voices: rest },
    { label: "HD voices", voices: hd },
    { label: "Preview", voices: preview },
  ].filter((g) => g.voices.length);
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const styleLabel = (s: string) => titleCase(s.replace(/-/g, " "));
