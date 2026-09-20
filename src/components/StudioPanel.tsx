"use client";

import { useState } from "react";
import { STUDIO, STUDIO_ORDER } from "@/lib/studio";
import {
  DEFAULT_STYLE,
  INFOGRAPHIC_STYLES,
  STYLE_ORDER,
  type InfographicStyle,
} from "@/lib/infographic";
import { VOICE_PRESETS, MULTITALKER_SPEAKERS, RATE_CHOICES } from "@/lib/voices";
import type {
  Artifact,
  ArtifactType,
  StudyDifficulty,
  StudyLength,
} from "@/lib/types";

export default function StudioPanel({
  notebookId,
  hasSources,
  selectedIds,
  artifacts,
  onOpen,
  onChanged,
}: {
  notebookId: string;
  hasSources: boolean;
  selectedIds: string[];
  artifacts: Artifact[];
  onOpen: (a: Artifact) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<InfographicStyle>(DEFAULT_STYLE);
  const [difficulty, setDifficulty] = useState<StudyDifficulty>("medium");
  const [length, setLength] = useState<StudyLength>("standard");
  const [voicePreset, setVoicePreset] = useState("conversational");
  const [hostA, setHostA] = useState(VOICE_PRESETS.conversational.a);
  const [hostB, setHostB] = useState(VOICE_PRESETS.conversational.b);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState<ArtifactType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    type: ArtifactType,
    url: string,
    body: Record<string, unknown>
  ) => {
    setBusy(type);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      await onChanged();
      onOpen(json as Artifact);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
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
      preset: voicePreset,
      // The classic pair uses full Azure voice names rather than the
      // multitalker speaker set, so per-host choices do not apply to it.
      ...(voicePreset === "classic" ? {} : { voices: { a: hostA, b: hostB } }),
      rate: speed,
    });

  const remove = async (id: string) => {
    await fetch(`/api/artifacts/${id}`, { method: "DELETE" });
    await onChanged();
  };

  const blocked = !hasSources || selectedIds.length === 0;
  const classicVoices = voicePreset === "classic";

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
            busy === "podcast" ? "shimmer border-[var(--accent)]" : ""
          }`}
        >
          <button
            disabled={blocked || !!busy}
            onClick={() => void generateAudio()}
            className="flex w-full items-center gap-3 px-3 pt-3 pb-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-xl">🎧</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Audio overview</span>
              <span className="block text-[10px] leading-snug text-[var(--muted)]">
                {busy === "podcast"
                  ? "Writing and narrating… this takes a minute"
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
                disabled={!!busy || classicVoices}
                onChange={setHostA}
              />
              <SpeakerSelect
                value={hostB}
                exclude={hostA}
                disabled={!!busy || classicVoices}
                onChange={setHostB}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                Speed
              </span>
              <select
                className="min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-[#0e1116] px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-[#4d5a7a]"
                value={speed}
                disabled={!!busy}
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
                value={voicePreset}
                disabled={!!busy}
                onChange={(e) => setVoicePreset(e.target.value)}
              >
                <option value="conversational">Natural dialogue</option>
                <option value="classic">Classic voices</option>
              </select>
            </div>

            {classicVoices && (
              <p className="text-[10px] leading-snug text-[var(--muted)]">
                Classic renders each turn as a separate voice, so it loses the
                conversational hand-off. Fixed pair: Andrew and Ava.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {STUDIO_ORDER.map((type) => {
            const s = STUDIO[type];
            const isBusy = busy === type;

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
                    disabled={blocked || !!busy}
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
                      disabled={!!busy}
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
                      disabled={!!busy}
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
                    disabled={blocked || !!busy}
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
                      disabled={!!busy}
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
                disabled={blocked || !!busy}
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
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

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
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpen(a)}
                  >
                    <div className="truncate text-[13px] font-medium">{a.title}</div>
                    <div className="text-[10px] text-[#6b7482]">
                      {STUDIO[a.type as ArtifactType]?.label} ·{" "}
                      {new Date(a.createdAt).toLocaleString()}
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
}: {
  value: string;
  exclude: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
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
  );
}
