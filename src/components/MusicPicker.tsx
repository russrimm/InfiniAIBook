"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_MUSIC_BYTES,
  MUSIC_EXTENSIONS,
  MUSIC_VOLUMES,
  type MusicChoice,
  type MusicTrack,
  type MusicVolume,
} from "@/lib/musicchoice";

const LIBRARY_EVENT = "infiniaibook:music-library";

/**
 * Every picker shares the library; an upload or delete in one updates the
 * others. The new list travels with the event so no picker ever holds a
 * selection its own list has not caught up with yet.
 */
function useMusicLibrary() {
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/music")
        .then((r) => (r.ok ? r.json() : { tracks: [] }))
        .then((j: { tracks?: MusicTrack[] }) => live && setTracks(j.tracks ?? []))
        .catch(() => live && setTracks([]));
    const onEvent = (e: Event) => {
      const list = (e as CustomEvent<MusicTrack[] | undefined>).detail;
      if (list) setTracks(list);
      else void load();
    };
    void load();
    window.addEventListener(LIBRARY_EVENT, onEvent);
    return () => {
      live = false;
      window.removeEventListener(LIBRARY_EVENT, onEvent);
    };
  }, []);
  const changed = (list?: MusicTrack[]) => {
    if (list) setTracks(list);
    window.dispatchEvent(new CustomEvent(LIBRARY_EVENT, { detail: list }));
  };
  return { tracks, changed };
}

const selectCls =
  "min-w-0 cursor-pointer rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus disabled:cursor-not-allowed disabled:opacity-50";
const iconBtn =
  "shrink-0 rounded-md border border-[var(--border)] bg-well px-1.5 py-1 text-[11px] leading-none text-[var(--muted)] transition hover:border-line-hover hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Background-music chooser: none, a random track or a specific one, with a
 * volume, a preview, and upload/delete for the in-app library.
 */
export default function MusicPicker({
  value,
  onChange,
  disabled = false,
  label = "Music",
}: {
  value: MusicChoice | null;
  onChange: (v: MusicChoice | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { tracks, changed } = useMusicLibrary();
  const fileInput = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  // A chosen track that has since been deleted falls back to no music.
  useEffect(() => {
    if (!tracks || !value || value.track === "random") return;
    if (!tracks.some((t) => t.id === value.track)) onChange(null);
  }, [tracks, value, onChange]);

  const selected = value && value.track !== "random" ? tracks?.find((t) => t.id === value.track) : undefined;
  const volume: MusicVolume = value?.volume ?? "medium";

  const stop = () => {
    audio.current?.pause();
    setPlaying(false);
  };

  const preview = () => {
    if (playing) return stop();
    if (!selected) return;
    const el = new Audio(`/api/music/${encodeURIComponent(selected.id)}`);
    el.volume = 0.8;
    el.onended = () => setPlaying(false);
    el.onerror = () => {
      setPlaying(false);
      setError("That track could not be played.");
    };
    audio.current?.pause();
    audio.current = el;
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const upload = async (file: File) => {
    setError(null);
    if (file.size > MAX_MUSIC_BYTES) {
      setError(`Tracks are limited to ${Math.round(MAX_MUSIC_BYTES / 1_048_576)} MB.`);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/music", { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        track?: MusicTrack;
        tracks?: MusicTrack[];
      };
      if (!res.ok || !j.track) throw new Error(j.error || "Upload failed.");
      changed(j.tracks ?? [j.track]);
      onChange({ track: j.track.id, volume });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!selected?.deletable) return;
    if (!window.confirm(`Delete "${selected.name}" from the music library?`)) return;
    stop();
    setError(null);
    const res = await fetch(`/api/music/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    const j = (await res.json().catch(() => ({}))) as { error?: string; tracks?: MusicTrack[] };
    if (!res.ok) {
      setError(j.error || "Could not delete that track.");
      return;
    }
    onChange(null);
    changed(j.tracks);
  };

  const empty = tracks !== null && tracks.length === 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
          {label}
        </span>
        <select
          aria-label="Background music"
          className={`${selectCls} flex-1`}
          disabled={disabled || tracks === null}
          value={value?.track ?? ""}
          onChange={(e) => {
            stop();
            onChange(e.target.value ? { track: e.target.value, volume } : null);
          }}
        >
          <option value="">No music</option>
          {!empty && <option value="random">Random track</option>}
          {(tracks ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.source === "folder" ? " (folder)" : ""}
            </option>
          ))}
        </select>
        {value && (
          <select
            aria-label="Music volume"
            className={`${selectCls} w-[4.6rem] shrink-0`}
            disabled={disabled}
            value={volume}
            onChange={(e) => onChange({ ...value, volume: e.target.value as MusicVolume })}
          >
            {(Object.keys(MUSIC_VOLUMES) as MusicVolume[]).map((k) => (
              <option key={k} value={k}>
                {MUSIC_VOLUMES[k].label}
              </option>
            ))}
          </select>
        )}
        {selected && (
          <button
            type="button"
            className={iconBtn}
            aria-label={playing ? "Stop preview" : `Preview ${selected.name}`}
            title={playing ? "Stop" : "Preview"}
            disabled={disabled}
            onClick={preview}
          >
            {playing ? "◼" : "▶"}
          </button>
        )}
        {selected?.deletable && (
          <button
            type="button"
            className={`${iconBtn} hover:!text-red-300`}
            aria-label={`Delete ${selected.name}`}
            title="Delete from library"
            disabled={disabled}
            onClick={() => void remove()}
          >
            ✕
          </button>
        )}
        <button
          type="button"
          className={iconBtn}
          aria-label="Upload a music track"
          title="Upload a track"
          disabled={disabled || uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? "…" : "＋"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={MUSIC_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>
      {empty && !error && (
        <p className="pl-[3.25rem] text-[10px] leading-snug text-[var(--muted)]">
          No tracks yet. Press ＋ to upload one you have the rights to use (
          {MUSIC_EXTENSIONS.join(" ")}). It plays under the voice, lowered while
          anyone speaks.
        </p>
      )}
      {error && <p className="pl-[3.25rem] text-[10px] leading-snug text-red-300">{error}</p>}
    </div>
  );
}
