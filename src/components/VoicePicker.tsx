"use client";

import { useEffect, useRef, useState } from "react";
import { PINNED_VOICES } from "@/lib/voices";
import {
  BASELINE_VOICES,
  groupVoices,
  styleLabel,
  type CatalogVoice,
} from "@/lib/voicecatalog";

let cached: Promise<CatalogVoice[]> | null = null;

/** One request per page load; the server keeps the list for a day. */
export function loadVoices(): Promise<CatalogVoice[]> {
  cached ??= fetch("/api/voices")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { voices?: CatalogVoice[] }) => (j.voices?.length ? j.voices : BASELINE_VOICES))
    .catch(() => {
      cached = null;
      return BASELINE_VOICES;
    });
  return cached;
}

const voiceLabel = (v: CatalogVoice) =>
  [v.name, v.gender, v.styles.length ? `${v.styles.length} styles` : ""].filter(Boolean).join(" · ");

type Props = {
  /** A pinned speaker name (Ava) or a full voice name. */
  voice: string;
  style?: string;
  onChange: (voice: string, style: string | undefined) => void;
  disabled?: boolean;
  voiceLabelText?: string;
  className?: string;
};

/** Voice, speaking style and a sample button, from the live voice list. */
export default function VoicePicker({
  voice,
  style,
  onChange,
  disabled,
  voiceLabelText = "Voice",
  className = "",
}: Props) {
  const [voices, setVoices] = useState<CatalogVoice[]>(BASELINE_VOICES);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let live = true;
    void loadVoices().then((v) => live && setVoices(v));
    return () => {
      live = false;
      audio.current?.pause();
    };
  }, []);

  const id = PINNED_VOICES[voice] ?? voice;
  const known = voices.find((v) => v.id === id);
  // A saved voice the list no longer offers still shows, rather than a blank box.
  const options = known ? voices : [...voices, { id, name: voice, gender: "", styles: [] }];
  const styles = known?.styles ?? [];
  const activeStyle = style && styles.includes(style) ? style : "";

  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
  };

  const play = () => {
    if (playing) return stop();
    setFailed(false);
    const q = new URLSearchParams({ voice: id });
    if (activeStyle) q.set("style", activeStyle);
    const a = new Audio(`/api/voices/preview?${q}`);
    audio.current = a;
    setPlaying(true);
    a.onended = () => setPlaying(false);
    a.onerror = () => {
      setPlaying(false);
      setFailed(true);
    };
    void a.play().catch(() => {
      setPlaying(false);
      setFailed(true);
    });
  };

  return (
    <>
      <select
        aria-label={voiceLabelText}
        className={className}
        value={id}
        disabled={disabled}
        onChange={(e) => {
          stop();
          onChange(e.target.value, undefined);
        }}
      >
        {groupVoices(options).map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {voiceLabel(v)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {styles.length > 0 && (
        <select
          aria-label={`${voiceLabelText} style`}
          className={className}
          value={activeStyle}
          disabled={disabled}
          onChange={(e) => {
            stop();
            onChange(voice, e.target.value || undefined);
          }}
        >
          <option value="">Default delivery</option>
          {styles.map((s) => (
            <option key={s} value={s}>
              {styleLabel(s)}
            </option>
          ))}
        </select>
      )}
      {known && (
        <button
          type="button"
          className="cursor-pointer rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-50"
          aria-label={playing ? "Stop sample" : "Play voice sample"}
          title={failed ? "The sample could not be played." : undefined}
          onClick={play}
        >
          {playing ? "Stop" : failed ? "Retry" : "Sample"}
        </button>
      )}
    </>
  );
}
