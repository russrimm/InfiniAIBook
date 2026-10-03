"use client";

import { useState, type ReactNode } from "react";
import {
  DEFAULT_MOTION_OPTIONS,
  DEFAULT_PALETTE,
  MAX_CHARACTER_CHARS,
  MAX_CLOSING_CHARS,
  MOTION_AUDIENCES,
  MOTION_LENGTHS,
  MOTION_MOVEMENTS,
  MOTION_PALETTES,
  MOTION_RESOLUTIONS,
  MOTION_TONES,
  MOTION_VISUALS,
  describeMotionOptions,
  normalizeMotionOptions,
  type MotionOptions,
  type MotionPalette,
  type MotionPaletteChoice,
} from "@/lib/motion";

/** Form state: like MotionOptions, but keeps text and custom colors while hidden. */
export type MotionForm = Omit<
  MotionOptions,
  "customPalette" | "characterDescription" | "closing"
> & {
  customPalette: MotionPalette;
  characterDescription: string;
  closing: string;
};

export const DEFAULT_MOTION_FORM: MotionForm = {
  ...DEFAULT_MOTION_OPTIONS,
  customPalette: { ...DEFAULT_PALETTE },
  characterDescription: "",
  closing: "",
};

/** The request fields for POST /api/motion. */
export function motionRequest(f: MotionForm): Record<string, unknown> {
  return {
    length: f.length,
    tone: f.tone,
    audience: f.audience,
    visual: f.visual,
    palette: f.palette,
    ...(f.palette === "custom" ? { customPalette: f.customPalette } : {}),
    character: f.character,
    ...(f.character === "custom" ? { characterDescription: f.characterDescription.trim() } : {}),
    ...(f.closing.trim() ? { closing: f.closing.trim() } : {}),
    resolution: f.resolution,
    movement: f.movement,
  };
}

const SELECT =
  "min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus";
const INPUT =
  "min-w-0 flex-1 rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none placeholder:text-faint focus:border-focus";
const LABEL = "w-16 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase";

const PALETTE_KEYS: (keyof MotionPalette)[] = ["dark", "primary", "accent", "pop", "light"];
const PALETTE_NAMES: Record<keyof MotionPalette, string> = {
  dark: "Text and closing card",
  primary: "Primary",
  accent: "Accent and stats",
  pop: "Highlight",
  light: "Background",
};

function Swatches({ colors }: { colors: MotionPalette }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
      {PALETTE_KEYS.map((k) => (
        <span
          key={k}
          className="h-3 w-3 rounded-full border border-black/30"
          style={{ background: colors[k] }}
        />
      ))}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    // A label element, so the control inside is announced with its row name.
    <label className="flex items-center gap-2">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Optional controls for a motion explainer. Collapsed by default; the header
 * lists whatever differs from the defaults so a hidden change is never a
 * surprise.
 */
export default function MotionCustomize({
  value,
  onChange,
}: {
  value: MotionForm;
  onChange: (next: MotionForm) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof MotionForm>(k: K, v: MotionForm[K]) => onChange({ ...value, [k]: v });
  const changed = describeMotionOptions(normalizeMotionOptions(motionRequest(value)));

  return (
    <div className="rounded-md border border-[var(--border)]">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-[11px] text-[var(--fg)]"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-[9px] text-[var(--muted)]">{open ? "▾" : "▸"}</span>
          <span className="font-medium">Customize</span>
          <span className="truncate text-[10px] text-[var(--muted)]">
            {changed.length ? changed.join(" · ") : "optional"}
          </span>
        </button>
        {changed.length > 0 && (
          <button
            type="button"
            className="shrink-0 cursor-pointer text-[10px] text-[var(--muted)] underline-offset-2 hover:text-[var(--fg)] hover:underline"
            onClick={() => onChange(DEFAULT_MOTION_FORM)}
          >
            Reset
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-2 border-t border-[var(--border)] px-2 py-2">
          <Row label="Length">
            <select
              className={SELECT}
              value={value.length}
              onChange={(e) => set("length", e.target.value as MotionForm["length"])}
            >
              {Object.entries(MOTION_LENGTHS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} · {v.scenes} scenes
                </option>
              ))}
            </select>
          </Row>

          <Row label="Tone">
            <select
              className={SELECT}
              value={value.tone}
              onChange={(e) => set("tone", e.target.value as MotionForm["tone"])}
            >
              {Object.entries(MOTION_TONES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Audience">
            <select
              className={SELECT}
              value={value.audience}
              onChange={(e) => set("audience", e.target.value as MotionForm["audience"])}
            >
              {Object.entries(MOTION_AUDIENCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Look">
            <select
              className={SELECT}
              value={value.visual}
              onChange={(e) => set("visual", e.target.value as MotionForm["visual"])}
            >
              {Object.entries(MOTION_VISUALS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Colors">
            <select
              className={SELECT}
              value={value.palette}
              onChange={(e) => set("palette", e.target.value as MotionPaletteChoice)}
            >
              <option value="auto">Auto, to suit the subject</option>
              {Object.entries(MOTION_PALETTES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {value.palette !== "auto" && value.palette !== "custom" && (
              <Swatches colors={MOTION_PALETTES[value.palette].colors} />
            )}
          </Row>
          {value.palette === "custom" && (
            <div className="flex items-center gap-2 pl-[4.5rem]">
              {PALETTE_KEYS.map((k) => (
                <input
                  key={k}
                  type="color"
                  title={PALETTE_NAMES[k]}
                  aria-label={`${PALETTE_NAMES[k]} color`}
                  className="h-6 w-7 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
                  value={value.customPalette[k]}
                  onChange={(e) =>
                    set("customPalette", { ...value.customPalette, [k]: e.target.value.toUpperCase() })
                  }
                />
              ))}
            </div>
          )}

          <Row label="Character">
            <select
              className={SELECT}
              value={value.character}
              onChange={(e) => set("character", e.target.value as MotionForm["character"])}
            >
              <option value="auto">Designed to suit the subject</option>
              <option value="custom">Describe my own…</option>
              <option value="none">No character, objects only</option>
            </select>
          </Row>
          {value.character === "custom" && (
            <div className="pl-[4.5rem]">
              <input
                className={`${INPUT} w-full`}
                maxLength={MAX_CHARACTER_CHARS}
                placeholder="e.g. a nurse in blue scrubs with a stethoscope"
                aria-label="Describe the character"
                value={value.characterDescription}
                onChange={(e) => set("characterDescription", e.target.value)}
              />
            </div>
          )}

          <Row label="Motion">
            <select
              aria-label="Character motion"
              className={SELECT}
              value={value.movement}
              onChange={(e) => set("movement", e.target.value as MotionForm["movement"])}
            >
              {Object.entries(MOTION_MOVEMENTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}: {v.blurb}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Closing">
            <input
              className={INPUT}
              maxLength={MAX_CLOSING_CHARS}
              placeholder="Optional call to action, e.g. Book a demo with the team"
              value={value.closing}
              onChange={(e) => set("closing", e.target.value)}
            />
          </Row>

          <Row label="Quality">
            <select
              className={SELECT}
              value={value.resolution}
              onChange={(e) => set("resolution", e.target.value as MotionForm["resolution"])}
            >
              {Object.entries(MOTION_RESOLUTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Row>

          <p className="text-[10px] leading-snug text-[var(--muted)]">
            Longer videos and 1080p take longer to make. A closing message is used
            as written, so it can include a link.
          </p>
        </div>
      )}
    </div>
  );
}
