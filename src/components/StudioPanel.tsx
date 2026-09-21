"use client";

import { useRef, useState } from "react";
import { STUDIO, STUDIO_ORDER } from "@/lib/studio";
import {
  DEFAULT_STYLE,
  INFOGRAPHIC_STYLES,
  STYLE_ORDER,
  type InfographicStyle,
} from "@/lib/infographic";
import {
  VOICE_PRESETS,
  MULTITALKER_SPEAKERS,
  RATE_CHOICES,
  AUDIO_LENGTHS,
  PINNED_VOICES,
  canPin,
  type AudioLength,
} from "@/lib/voices";

/** Speakers that can be pinned, listed when a chosen one cannot be. */
const PINNABLE = Object.keys(PINNED_VOICES);
import type {
  ArtifactSummary,
  ArtifactType,
  StudyDifficulty,
  StudyLength,
} from "@/lib/types";

/** How the dialogue is rendered: voice family plus pause shaping. */
type Delivery = "natural" | "even" | "pinned";

export default function StudioPanel({
  notebookId,
  hasSources,
  selectedIds,
  artifacts,
  onOpen,
  openingId,
  onChanged,
}: {
  notebookId: string;
  hasSources: boolean;
  selectedIds: string[];
  artifacts: ArtifactSummary[];
  /** Freshly generated artifacts arrive whole; list entries are fetched first. */
  onOpen: (a: ArtifactSummary) => void;
  openingId: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<InfographicStyle>(DEFAULT_STYLE);
  const [difficulty, setDifficulty] = useState<StudyDifficulty>("medium");
  const [length, setLength] = useState<StudyLength>("standard");
  const [delivery, setDelivery] = useState<Delivery>("natural");
  const [audioLen, setAudioLen] = useState<AudioLength>("medium");
  const [narrator, setNarrator] = useState("Ava");
  const [hostA, setHostA] = useState(VOICE_PRESETS.conversational.a);
  const [hostB, setHostB] = useState(VOICE_PRESETS.conversational.b);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState<Set<ArtifactType>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<ArtifactType, string>>>({});
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /** Play a speaker's sample, replacing whatever was playing. */
  const preview = async (name: string) => {
    previewAudio.current?.pause();
    setPreviewError(null);
    setPreviewing(null);
    // The first sample for a voice is synthesised on demand and can take
    // several seconds, so loading is shown distinctly from playing.
    setPreviewLoading(name);
    try {
      const res = await fetch(`/api/voice-preview/${encodeURIComponent(name)}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Could not play that voice.");
      }
      const url = URL.createObjectURL(await res.blob());
      const el = new Audio(url);
      previewAudio.current = el;
      const finish = () => {
        setPreviewing((p) => (p === name ? null : p));
        URL.revokeObjectURL(url);
      };
      el.onended = finish;
      el.onerror = finish;
      await el.play();
      setPreviewLoading(null);
      setPreviewing(name);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Could not play that voice.");
      setPreviewing(null);
      setPreviewLoading(null);
    }
  };

  /**
   * Generation runs in the background. A format is blocked only while that
   * same format is running — everything else in the studio, and every artifact
   * already made, stays usable while a long job finishes.
   */
  const run = async (
    type: ArtifactType,
    url: string,
    body: Record<string, unknown>
  ) => {
    setRunning((prev) => new Set(prev).add(type));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      await onChanged();
      // Opened through the same path as a list entry so the modal always shows
      // the stored row rather than whatever the POST happened to return.
      onOpen(json as ArtifactSummary);
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [type]: e instanceof Error ? e.message : "Generation failed",
      }));
    } finally {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    }
  };

  const generate = (type: ArtifactType) =>
    run(type, "/api/generate", {
      notebookId,
      type,
      topic: topic.trim() || undefined,
      sourceIds: selectedIds,
      ...(type === "infographic" ? { style } : {}),
      ...(STUDIO[type].study ? { difficulty, length } : {}),
    });

  const generateAudio = () =>
    run("podcast", "/api/podcast", {
      notebookId,
      topic: topic.trim() || undefined,
      sourceIds: selectedIds,
      preset: delivery === "pinned" ? "classic" : "conversational",
      voices: { a: hostA, b: hostB },
      rate: speed,
      breath: delivery === "even" ? 0 : 1,
      length: audioLen,
    });

  const generateVideo = () =>
    run("video", "/api/video", {
      notebookId,
      topic: topic.trim() || undefined,
      sourceIds: selectedIds,
      voice: narrator,
    });

  const remove = async (id: string) => {
    await fetch(`/api/artifacts/${id}`, { method: "DELETE" });
    await onChanged();
  };

  const blocked = !hasSources || selectedIds.length === 0;
  const audioBusy = running.has("podcast");
  const videoBusy = running.has("video");
  const pinnedVoices = delivery === "pinned";
  /** Fixed voices exist for only some speakers, so warn before generating. */
  const unpinnable = pinnedVoices
    ? [hostA, hostB].filter((n) => !canPin(n))
    : [];

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[var(--panel)]">
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold tracking-wide">Studio</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Turn your sources into something you can actually use.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <input
          className="input mb-3"
          placeholder="Optional focus, e.g. 'funding risks'"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <div
          className={`card relative mb-2 overflow-hidden transition ${
            audioBusy ? "shimmer border-[var(--accent)]" : ""
          }`}
        >
          <button
            disabled={blocked || audioBusy}
            onClick={() => void generateAudio()}
            className="flex w-full items-center gap-3 px-3 pt-3 pb-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-xl">🎧</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Audio overview</span>
              <span className="block text-[10px] leading-snug text-[var(--muted)]">
                {audioBusy
                  ? `Writing and narrating about ${AUDIO_LENGTHS[audioLen].minutes} minutes — this takes a while`
                  : "Two hosts discuss your sources"}
              </span>
            </span>
          </button>

          <div className="space-y-2 border-t border-[var(--border)] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                Hosts
              </span>
              <SpeakerSelect
                value={hostA}
                exclude={hostB}
                disabled={false}
                onChange={setHostA}
                onPreview={preview}
                previewing={previewing}
                loading={previewLoading}
              />
              <SpeakerSelect
                value={hostB}
                exclude={hostA}
                disabled={false}
                onChange={setHostB}
                onPreview={preview}
                previewing={previewing}
                loading={previewLoading}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                Length
              </span>
              <select
                className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-[#0e1116] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a]"
                value={audioLen}
                disabled={false}
                onChange={(e) => setAudioLen(e.target.value as AudioLength)}
              >
                {(Object.keys(AUDIO_LENGTHS) as AudioLength[]).map((k) => (
                  <option key={k} value={k}>
                    {AUDIO_LENGTHS[k].label} — about {AUDIO_LENGTHS[k].minutes} min
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                Speed
              </span>
              <select
                className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-[#0e1116] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a]"
                value={speed}
                disabled={false}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {RATE_CHOICES.map((r) => (
                  <option key={r} value={r}>
                    {r === 1 ? "Normal speed" : `${r}× speed`}
                  </option>
                ))}
              </select>
              <select
                className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-[#0e1116] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a]"
                value={delivery}
                disabled={false}
                onChange={(e) => setDelivery(e.target.value as Delivery)}
              >
                <option value="natural">Natural dialogue</option>
                <option value="even">Even delivery</option>
                <option value="pinned">Fixed voices</option>
              </select>
            </div>

            {pinnedVoices && (
              <p className="text-[10px] leading-snug text-[var(--muted)]">
                {unpinnable.length ? (
                  <span className="text-amber-200/90">
                    {unpinnable.join(" and ")}{" "}
                    {unpinnable.length === 1 ? "has" : "have"} no fixed voice — pick
                    from: {PINNABLE.join(", ")}.
                  </span>
                ) : (
                  <>
                    Each turn is rendered by a named voice rather than by the
                    multi-speaker model, so the voice cannot drift. The hosts stop
                    handing off to each other, so it sounds a little more read-aloud.
                  </>
                )}
              </p>
            )}
            {previewError && (
              <p className="text-[10px] leading-snug text-red-300">{previewError}</p>
            )}
          </div>
        </div>

        <div
          className={`card relative mb-2 overflow-hidden transition ${
            videoBusy ? "shimmer border-[var(--accent)]" : ""
          }`}
        >
          <button
            disabled={blocked || videoBusy}
            onClick={() => void generateVideo()}
            className="flex w-full items-center gap-3 px-3 pt-3 pb-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-xl">🎬</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Whiteboard video</span>
              <span className="block text-[10px] leading-snug text-[var(--muted)]">
                {videoBusy
                  ? "Planning the scenes — drawing takes a few minutes"
                  : "A hand draws your sources, narrated"}
              </span>
            </span>
          </button>

          <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2">
            <span className="w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
              Voice
            </span>
            <SpeakerSelect
              value={narrator}
              exclude=""
              disabled={false}
              onChange={setNarrator}
              onPreview={preview}
              previewing={previewing}
              loading={previewLoading}
            />
            <span className="shrink-0 text-[10px] leading-snug text-[var(--muted)]">
              Uses the focus box above
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {STUDIO_ORDER.map((type) => {
            const s = STUDIO[type];
            const isBusy = running.has(type);

            // Study aids carry their own level and length controls for the
            // same reason the infographic carries its style picker: settings
            // parked elsewhere in the panel read as global and get missed.
            if (s.study) {
              return (
                <div
                  key={type}
                  className={`card relative col-span-2 overflow-hidden transition ${
                    isBusy ? "shimmer border-[var(--accent)]" : ""
                  }`}
                >
                  <button
                    disabled={blocked || isBusy}
                    onClick={() => void generate(type)}
                    className="flex w-full items-center gap-3 px-3 pt-3 pb-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-lg">{s.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{s.label}</span>
                      <span className="block text-[10px] leading-snug text-[var(--muted)]">
                        {isBusy ? "Generating…" : s.blurb}
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2">
                    <span className="shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                      Level
                    </span>
                    <select
                      className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-[#0e1116] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a]"
                      value={difficulty}
                      disabled={false}
                      onChange={(e) =>
                        setDifficulty(e.target.value as StudyDifficulty)
                      }
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                    <span className="shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                      Length
                    </span>
                    <select
                      className="shrink-0 cursor-pointer rounded-md border border-[var(--border)] bg-[#0e1116] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a]"
                      value={length}
                      disabled={false}
                      onChange={(e) => setLength(e.target.value as StudyLength)}
                    >
                      <option value="short">Short</option>
                      <option value="standard">Standard</option>
                      <option value="long">Long</option>
                    </select>
                  </div>
                </div>
              );
            }

            // The infographic has nineteen styles, so its card carries its own
            // chooser. A picker elsewhere in the panel reads as a global
            // setting and gets missed.
            if (type === "infographic") {
              return (
                <div
                  key={type}
                  className={`card relative col-span-2 overflow-hidden transition ${
                    isBusy ? "shimmer border-[var(--accent)]" : ""
                  }`}
                >
                  <button
                    disabled={blocked || isBusy}
                    onClick={() => void generate(type)}
                    className="flex w-full items-center gap-3 px-3 pt-3 pb-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-lg">{s.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{s.label}</span>
                      <span className="block text-[10px] leading-snug text-[var(--muted)]">
                        {isBusy ? "Generating…" : s.blurb}
                      </span>
                    </span>
                  </button>

                  <label className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2">
                    <span className="shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                      Style
                    </span>
                    <select
                      className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-[#0e1116] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a]"
                      value={style}
                      disabled={false}
                      onChange={(e) => setStyle(e.target.value as InfographicStyle)}
                    >
                      {STYLE_ORDER.map((key) => (
                        <option key={key} value={key}>
                          {INFOGRAPHIC_STYLES[key].icon} {INFOGRAPHIC_STYLES[key].label} —{" "}
                          {INFOGRAPHIC_STYLES[key].blurb}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            }

            return (
              <button
                key={type}
                disabled={blocked || isBusy}
                onClick={() => void generate(type)}
                className={`card group relative overflow-hidden px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isBusy ? "shimmer border-[var(--accent)]" : "hover:border-[#39424f]"
                }`}
              >
                <div className="mb-1.5 text-lg">{s.icon}</div>
                <div className="text-[13px] font-medium">{s.label}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
                  {isBusy ? "Generating…" : s.blurb}
                </div>
              </button>
            );
          })}
        </div>

        {blocked && (
          <p className="mt-3 text-[11px] text-[var(--muted)]">
            {hasSources
              ? "Select at least one source to generate."
              : "Add a source to unlock the studio."}
          </p>
        )}
        {Object.entries(errors).map(([type, message]) => (
          <p key={type} className="mt-3 text-xs text-red-400">
            <span className="font-medium">
              {STUDIO[type as ArtifactType]?.label ?? type}:
            </span>{" "}
            {message}
          </p>
        ))}

        {running.size > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
            Generating{" "}
            {[...running]
              .map((t) => STUDIO[t]?.label.toLowerCase() ?? t)
              .join(", ")}{" "}
            in the background — carry on using the rest of the notebook.
          </p>
        )}

        <div className="mt-6">
          <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Generated
          </h3>
          {artifacts.length === 0 ? (
            <p className="text-[11px] text-[var(--muted)]">
              Nothing yet. Pick a format above.
            </p>
          ) : (
            <ul className="space-y-1">
              {artifacts.map((a) => (
                <li
                  key={a.id}
                  className="group flex items-center gap-2 rounded-xl border border-transparent px-2 py-2 transition hover:border-[var(--border)] hover:bg-[#171b21]"
                >
                  <span className="text-base">
                    {STUDIO[a.type as ArtifactType]?.icon ?? "📄"}
                  </span>
                  <button
                    className="min-w-0 flex-1 text-left disabled:opacity-60"
                    onClick={() => onOpen(a)}
                    disabled={openingId === a.id}
                  >
                    <div className="truncate text-[13px] font-medium">{a.title}</div>
                    <div className="text-[10px] text-[#6b7482]">
                      {openingId === a.id
                        ? "Opening…"
                        : `${STUDIO[a.type as ArtifactType]?.label} · ${new Date(
                            a.createdAt
                          ).toLocaleString()}`}
                    </div>
                  </button>
                  <button
                    aria-label="Delete"
                    className="shrink-0 rounded px-1 text-xs text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                    onClick={() => void remove(a.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * One host's voice. The other host's pick is excluded rather than merely
 * flagged: two identical speakers render a dialogue in a single voice, which
 * reads as a bug rather than a choice.
 */
function SpeakerSelect({
  value,
  exclude,
  disabled,
  onChange,
  onPreview,
  previewing,
  loading,
}: {
  value: string;
  exclude: string;
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
        className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-[#0e1116] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a] disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <optgroup label="Female">
          {MULTITALKER_SPEAKERS.female
            .filter((n) => n !== exclude)
            .map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
        </optgroup>
        <optgroup label="Male">
          {MULTITALKER_SPEAKERS.male
            .filter((n) => n !== exclude)
            .map((n) => (
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
        className="shrink-0 rounded-md border border-[var(--border)] bg-[#0e1116] px-1.5 py-1 text-[11px] leading-none text-[var(--muted)] transition hover:border-[#39424f] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "…" : playing ? "◼" : "▶"}
      </button>
    </div>
  );
}
