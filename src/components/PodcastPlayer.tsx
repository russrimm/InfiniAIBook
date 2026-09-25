"use client";

import { useEffect, useRef, useState } from "react";
import type { PodcastContent, PodcastSpeakerId } from "@/lib/types";

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SPEEDS = [1, 1.25, 1.5, 2];
const SPEAKER_COLORS: Record<PodcastSpeakerId, string> = {
  a: "text-[#8f9dff]",
  b: "text-[#6ee7b7]",
  c: "text-[#fbbf24]",
  d: "text-[#f0abfc]",
};

function speakerLabel(content: PodcastContent, id: PodcastSpeakerId): string {
  const profile = content.speakers?.find((s) => s.id === id);
  return profile?.name?.trim() || content.voices[id] || id.toUpperCase();
}

export default function PodcastPlayer({ content }: { content: PodcastContent }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(content.durationSec || 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const active = (() => {
    let idx = -1;
    for (let i = 0; i < content.turns.length; i++) {
      if (content.turns[i].at <= time + 0.15) idx = i;
      else break;
    }
    return idx;
  })();

  useEffect(() => {
    if (!follow || active < 0) return;
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, follow]);

  const seek = (to: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(to, duration || el.duration || 0));
    setTime(el.currentTime);
  };

  const chapters = content.chapters ?? [];
  const activeChapter = (() => {
    let idx = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].at <= time + 0.15) idx = i;
      else break;
    }
    return idx;
  })();

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  return (
    <div>
      <audio
        ref={audioRef}
        src={content.audioUrl}
        preload="metadata"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError("The audio file could not be loaded.")}
      />

      <div className="rounded-2xl border border-[var(--border)] bg-[#0e1116] p-5">
        {content.description && (
          <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
            {content.description}
          </p>
        )}

        <div
          className="group relative h-2 cursor-pointer rounded-full bg-[#1e2430]"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - r.left) / r.width) * (duration || 0));
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
            style={{ width: `${duration ? (time / duration) * 100 : 0}%` }}
          />
          {content.turns.map((t, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-[#39424f]"
              style={{ left: `${duration ? (t.at / duration) * 100 : 0}%` }}
            />
          ))}
          {/* Chapters sit above the turn ticks so a topic is findable on the
              bar itself, not only in the list below. */}
          {chapters.map((c, i) => (
            <span
              key={`c${i}`}
              aria-hidden
              title={c.title}
              className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-[#8f9dff]"
              style={{ left: `${duration ? (c.at / duration) * 100 : 0}%` }}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            className="btn !px-3"
            onClick={() => seek(time - 10)}
            aria-label="Back 10 seconds"
          >
            ↺10
          </button>
          <button
            className="btn btn-primary !h-10 !w-10 !rounded-full !px-0"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            className="btn !px-3"
            onClick={() => seek(time + 10)}
            aria-label="Forward 10 seconds"
          >
            10↻
          </button>

          <span className="ml-1 font-mono text-xs text-[var(--muted)] tabular-nums">
            {clock(time)} / {clock(duration)}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              className="btn !px-2.5 !py-1 !text-xs"
              onClick={() => {
                const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
                setSpeed(next);
                if (audioRef.current) audioRef.current.playbackRate = next;
              }}
            >
              {speed}×
            </button>
            <a className="btn !px-2.5 !py-1 !text-xs" href={content.audioUrl} download>
              Download
            </a>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        {chapters.length > 0 && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                Topics
              </span>
              <select
                className="ml-auto min-w-0 max-w-[60%] cursor-pointer rounded-md border border-[var(--border)] bg-[#12151a] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a]"
                value={activeChapter >= 0 ? activeChapter : ""}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  if (Number.isInteger(i) && chapters[i]) seek(chapters[i].at);
                }}
              >
                {activeChapter < 0 && <option value="">Jump to a topic…</option>}
                {chapters.map((c, i) => (
                  <option key={i} value={i}>
                    {clock(c.at)} · {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {chapters.map((c, i) => (
                <button
                  key={i}
                  onClick={() => seek(c.at)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    i === activeChapter
                      ? "border-[var(--accent)] bg-[#1b2030] text-[var(--fg)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[#39424f] hover:text-[var(--fg)]"
                  }`}
                >
                  <span className="font-mono tabular-nums opacity-70">{clock(c.at)}</span>{" "}
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
          Transcript
        </h3>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <input
            type="checkbox"
            className="h-3 w-3 accent-[var(--accent)]"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          Follow along
        </label>
      </div>

      <ul className="space-y-1">
        {content.turns.map((t, i) => {
          const isActive = i === active;
          return (
            <li
              key={i}
              ref={isActive ? activeRef : null}
              className={`flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 transition ${
                isActive ? "bg-[#1b2030]" : "hover:bg-[#151a21]"
              }`}
              onClick={() => seek(t.at)}
            >
              <span
                className={`mt-0.5 shrink-0 text-[10px] font-semibold tracking-wide uppercase ${
                  SPEAKER_COLORS[t.speaker]
                }`}
                style={{ minWidth: "3.2rem" }}
              >
                {speakerLabel(content, t.speaker)}
              </span>
              <p
                className={`flex-1 text-[14px] leading-relaxed ${
                  isActive ? "text-[#f2f5f9]" : "text-[#c9d2dd]"
                }`}
              >
                {t.text}
              </p>
              <span className="mt-0.5 shrink-0 font-mono text-[10px] text-[#6b7482] tabular-nums">
                {clock(t.at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
