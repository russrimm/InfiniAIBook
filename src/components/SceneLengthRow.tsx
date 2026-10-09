"use client";

import { useEffect, useState } from "react";

const SELECT =
  "min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus";
const NUMBER =
  "w-16 rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus";
const LABEL = "w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase";

const minutesText = (scenes: number, secondsPerScene: number) =>
  String(Math.round(((scenes * secondsPerScene) / 60) * 10) / 10);

/**
 * Length for videos built from scenes: a few presets, or "custom" where the
 * viewer picks either a running time or a scene count. The two stay in step
 * because a scene averages a known number of seconds.
 */
export default function SceneLengthRow({
  label,
  presets,
  value,
  onChange,
  scenes,
  onScenes,
  min,
  max,
  secondsPerScene,
}: {
  label: string;
  presets: { key: string; text: string }[];
  /** A preset key, or "custom". */
  value: string;
  onChange: (key: string) => void;
  /** The custom scene count. */
  scenes: number;
  onScenes: (n: number) => void;
  min: number;
  max: number;
  secondsPerScene: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const fromMinutes = (m: number) => clamp((m * 60) / secondsPerScene);
  const [minText, setMinText] = useState(() => minutesText(scenes, secondsPerScene));

  // Follow the scene count unless the typed minutes already produce it.
  useEffect(() => {
    setMinText((current) => {
      const typed = Number(current);
      return current !== "" && Number.isFinite(typed) && fromMinutes(typed) === scenes
        ? current
        : minutesText(scenes, secondsPerScene);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, secondsPerScene, min, max]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={LABEL}>Length</span>
        <select
          className={SELECT}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {presets.map((p) => (
            <option key={p.key} value={p.key}>
              {p.text}
            </option>
          ))}
          <option value="custom">Custom — set your own</option>
        </select>
      </div>
      {value === "custom" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[3.25rem]">
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
            Scenes
            <input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              className={NUMBER}
              aria-label={`${label}: number of scenes`}
              value={scenes}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && e.target.value !== "") onScenes(clamp(n));
              }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
            or minutes
            <input
              type="number"
              inputMode="decimal"
              min={minutesText(min, secondsPerScene)}
              max={minutesText(max, secondsPerScene)}
              step={0.5}
              className={NUMBER}
              aria-label={`${label}: running time in minutes`}
              value={minText}
              onChange={(e) => {
                setMinText(e.target.value);
                const m = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(m) && m > 0) {
                  onScenes(fromMinutes(m));
                }
              }}
            />
          </label>
          <p className="basis-full text-[10px] leading-snug text-[var(--muted)]">
            {min}–{max} scenes, about {secondsPerScene} seconds each. Every
            scene is drawn and narrated, so longer videos take longer to
            render.
          </p>
        </div>
      )}
    </div>
  );
}
