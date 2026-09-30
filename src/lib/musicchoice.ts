/**
 * The background-music choice a spoken Studio format carries. Pure and
 * client-safe; the track library itself lives in music.ts.
 */

export type MusicVolume = "low" | "medium" | "high";

export type MusicChoice = {
  /** A track id from the library, or "random" for any track. */
  track: string;
  volume: MusicVolume;
};

export type MusicTrack = {
  id: string;
  name: string;
  /** "library" tracks were uploaded in the app; "folder" ones come from MOTION_MUSIC_DIR. */
  source: "library" | "folder";
  bytes: number;
  deletable: boolean;
};

export const MUSIC_VOLUMES: Record<MusicVolume, { label: string; gain: number }> = {
  low: { label: "Quiet", gain: 0.18 },
  medium: { label: "Medium", gain: 0.3 },
  high: { label: "Loud", gain: 0.45 },
};

export const MUSIC_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"] as const;

export const MAX_MUSIC_BYTES = 50 * 1024 * 1024;

const TRACK_ID = /^(?:random|[ud]-[A-Za-z0-9_-]{1,40})$/;

/** Null means no music. Anything malformed is treated as no music. */
export function normalizeMusicChoice(v: unknown): MusicChoice | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { track?: unknown; volume?: unknown };
  const track = typeof o.track === "string" ? o.track.trim() : "";
  if (!track || !TRACK_ID.test(track)) return null;
  const volume: MusicVolume =
    o.volume === "low" || o.volume === "high" || o.volume === "medium" ? o.volume : "medium";
  return { track, volume };
}
