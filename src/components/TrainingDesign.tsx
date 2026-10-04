"use client";

import { useState } from "react";
import { MOTION_PALETTES } from "@/lib/motion";
import {
  CAPTION_LABELS,
  CAPTION_MODES,
  CUE_TRANSITIONS,
  LAYOUTS,
  LAYOUT_LABELS,
  PIP_CORNERS,
  TRAINING_RESOLUTIONS,
  TRANSITION_LABELS,
  type TrainingComposition,
  type TrainingResolution,
} from "@/lib/trainingvisuals";
import { fileToPng } from "./trainingRaster";

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-well px-2.5 py-1.5 text-[13px] text-[var(--fg)] outline-none placeholder:text-faint focus:border-focus disabled:opacity-60";
const labelCls = "mb-1 block text-[10px] tracking-wide text-[var(--muted)] uppercase";

const CORNER_LABELS: Record<(typeof PIP_CORNERS)[number], string> = {
  "bottom-right": "Bottom right",
  "bottom-left": "Bottom left",
  "top-right": "Top right",
  "top-left": "Top left",
};

/** Video-level look of a composed training video. */
export default function TrainingDesign({
  artifactId,
  value,
  disabled,
  onChange,
}: {
  artifactId: string;
  value: TrainingComposition;
  disabled: boolean;
  /** Merged into the latest settings, so a slow logo upload cannot undo other edits. */
  onChange: (patch: Partial<TrainingComposition>) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const set = onChange;
  const composed = value.mode === "composed";
  const off = disabled || !composed;

  const toggle = (key: "sectionCards" | "intro" | "outro", label: string) => (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" checked={value[key]} disabled={off} onChange={(e) => set({ [key]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className={labelCls}>Style</legend>
        <div className="flex flex-wrap gap-2">
          {(["composed", "presenter"] as const).map((m) => (
            <label
              key={m}
              className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-[13px] ${
                value.mode === m ? "border-[var(--accent)] bg-well" : "border-[var(--border)]"
              }`}
            >
              <input type="radio" name="training-mode" className="sr-only" checked={value.mode === m} onChange={() => set({ mode: m })} />
              <span className="block font-medium">{m === "composed" ? "Presenter with visuals" : "Presenter only"}</span>
              <span className="block text-[10px] leading-snug text-[var(--muted)]">
                {m === "composed"
                  ? "Slides, numbers, pictures and infographics arrive as the presenter talks about them."
                  : "One avatar video on a solid background with burned-in subtitles."}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`space-y-4 ${composed ? "" : "opacity-50"}`}>
        <div>
          <span className={labelCls}>Theme</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            {(Object.keys(MOTION_PALETTES) as (keyof typeof MOTION_PALETTES)[]).map((k) => {
              const c = MOTION_PALETTES[k].colors;
              return (
                <button
                  key={k}
                  role="radio"
                  aria-checked={value.palette === k}
                  disabled={off}
                  onClick={() => set({ palette: k })}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                    value.palette === k ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                >
                  <span className="flex">
                    {[c.dark, c.primary, c.accent, c.light].map((col) => (
                      <span key={col} className="h-3 w-3 first:rounded-l-sm last:rounded-r-sm" style={{ background: col }} />
                    ))}
                  </span>
                  {MOTION_PALETTES[k].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className={labelCls}>Default layout for new visuals</span>
            <select
              className={inputCls}
              value={value.defaultLayout}
              disabled={off}
              onChange={(e) => set({ defaultLayout: e.target.value as TrainingComposition["defaultLayout"] })}
            >
              {LAYOUTS.filter((l) => l !== "presenter").map((l) => (
                <option key={l} value={l}>
                  {LAYOUT_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Default transition</span>
            <select
              className={inputCls}
              value={value.transition}
              disabled={off}
              onChange={(e) => set({ transition: e.target.value as TrainingComposition["transition"] })}
            >
              {CUE_TRANSITIONS.map((t) => (
                <option key={t} value={t}>
                  {TRANSITION_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Corner presenter position</span>
            <select
              className={inputCls}
              value={value.pipCorner}
              disabled={off}
              onChange={(e) => set({ pipCorner: e.target.value as TrainingComposition["pipCorner"] })}
            >
              {PIP_CORNERS.map((c) => (
                <option key={c} value={c}>
                  {CORNER_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Captions</span>
            <select
              className={inputCls}
              value={value.captions}
              disabled={off}
              onChange={(e) => set({ captions: e.target.value as TrainingComposition["captions"] })}
            >
              {CAPTION_MODES.map((c) => (
                <option key={c} value={c}>
                  {CAPTION_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Resolution</span>
            <select
              className={inputCls}
              value={value.resolution}
              disabled={off}
              onChange={(e) => set({ resolution: e.target.value as TrainingResolution })}
            >
              {(Object.keys(TRAINING_RESOLUTIONS) as TrainingResolution[]).map((r) => (
                <option key={r} value={r}>
                  {TRAINING_RESOLUTIONS[r].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {toggle("intro", "Opening title card")}
          {toggle("sectionCards", "Title card between sections")}
          {toggle("outro", "Closing card")}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={value.lowerThird.enabled}
              disabled={off}
              onChange={(e) => set({ lowerThird: { ...value.lowerThird, enabled: e.target.checked } })}
            />
            Name the presenter on screen at the start
          </label>
          {value.lowerThird.enabled && (
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                value={value.lowerThird.name}
                disabled={off}
                placeholder="Presenter name"
                aria-label="Presenter name"
                onChange={(e) => set({ lowerThird: { ...value.lowerThird, name: e.target.value } })}
              />
              <input
                className={inputCls}
                value={value.lowerThird.role}
                disabled={off}
                placeholder="Role, such as Your trainer"
                aria-label="Presenter role"
                onChange={(e) => set({ lowerThird: { ...value.lowerThird, role: e.target.value } })}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={labelCls}>Logo</span>
          {value.logoId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/image/${value.logoId}`} alt="Logo" className="h-8 rounded border border-[var(--border)] bg-white/90 p-0.5" />
          )}
          <label className={`btn !text-[11px] ${off || uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
            {uploading ? "Uploading…" : value.logoId ? "Replace logo" : "Add logo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={off || uploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setUploading(true);
                setError(null);
                try {
                  const res = await fetch(`/api/training/${artifactId}/assets`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ dataUrl: await fileToPng(f, 800) }),
                  });
                  const j = (await res.json().catch(() => ({}))) as { imageId?: string; error?: string };
                  if (!res.ok || !j.imageId) throw new Error(j.error || "Could not save the logo.");
                  set({ logoId: j.imageId });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not save the logo.");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          {value.logoId && (
            <button className="btn !text-[11px]" disabled={off} onClick={() => set({ logoId: undefined })}>
              Remove
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-red-300">{error}</p>}
      </div>
    </div>
  );
}
