import { MULTITALKER_SPEAKERS } from "@/lib/voices";

/** "about 30 seconds" or "about 2.5 min". */
export function approxLength(seconds: number): string {
  if (seconds < 90) return `about ${Math.round(seconds / 5) * 5} seconds`;
  return `about ${Math.round((seconds / 60) * 2) / 2} min`;
}

/** A labelled length dropdown, shared by the cards that size their output. */
export function LengthRow<K extends string>({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: K;
  onChange: (v: K) => void;
  choices: { key: K; text: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
        Length
      </span>
      <select
        className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as K)}
      >
        {choices.map((c) => (
          <option key={c.key} value={c.key}>
            {c.text}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * One speaker's voice, shared by the audio and video controls.
 */
export function SpeakerSelect({
  value,
  disabled,
  onChange,
  onPreview,
  previewing,
  loading,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  onPreview: (name: string) => void;
  previewing: string | null;
  loading: string | null;
}) {
  const playing = previewing === value;
  const isLoading = loading === value;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <select
        aria-label="Voice"
        className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <optgroup label="Female">
          {MULTITALKER_SPEAKERS.female.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </optgroup>
        <optgroup label="Male">
          {MULTITALKER_SPEAKERS.male.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </optgroup>
      </select>
      <button
        type="button"
        aria-label={`Hear ${value}`}
        title={`Hear ${value}`}
        disabled={disabled}
        onClick={() => onPreview(value)}
        className="shrink-0 rounded-md border border-[var(--border)] bg-well px-1.5 py-1 text-[11px] leading-none text-[var(--muted)] transition hover:border-line-hover hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "…" : playing ? "◼" : "▶"}
      </button>
    </div>
  );
}
