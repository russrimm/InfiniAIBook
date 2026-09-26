"use client";

import { useEffect, useRef, useState } from "react";
import type { TrainingContent, TrainingSection } from "@/lib/types";
import { WORDS_PER_MINUTE } from "@/lib/voices";
import {
  AVATAR_PRESETS,
  BACKGROUNDS,
  MAX_AVATAR_MINUTES,
  PRESENTER_VOICES,
} from "@/lib/avatars";

const STAGES: { key: string; label: string }[] = [
  { key: "submitting", label: "Sending the transcript to Azure" },
  { key: "submitted", label: "Queued for the avatar" },
  { key: "rendering", label: "Rendering the presenter" },
  { key: "downloading", label: "Saving the video" },
];

const IN_FLIGHT = new Set(STAGES.map((s) => s.key));

type Draft = {
  title: string;
  objectives: string;
  sections: TrainingSection[];
  presenter: string;
  voice: string;
  background: string;
};

const toDraft = (c: TrainingContent): Draft => ({
  title: c.title,
  objectives: (c.objectives ?? []).join("\n"),
  sections: c.sections.map((s) => ({ ...s })),
  presenter: c.presenter,
  voice: c.voice,
  background: c.background,
});

const words = (sections: TrainingSection[]) =>
  sections.reduce((n, s) => n + (s.text.match(/\S+/g)?.length ?? 0), 0);

const fmt = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-[#0e1116] px-2.5 py-1.5 text-[13px] text-[var(--fg)] outline-none placeholder:text-[#53606f] focus:border-[#4d5a7a] disabled:opacity-60";

export default function TrainingVideo({
  artifactId,
  content,
  onRefresh,
}: {
  artifactId: string;
  content: TrainingContent;
  onRefresh: () => Promise<void> | void;
}) {
  const stage = content.progress?.stage ?? "transcript";
  const rendering = IN_FLIGHT.has(stage);

  const [draft, setDraft] = useState<Draft>(() => toDraft(content));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "render" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Adopt the stored transcript whenever it changes underneath us, unless the
  // user is mid-edit — polling must never overwrite what they are typing.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const stored = JSON.stringify([
    content.title,
    content.objectives,
    content.sections,
    content.presenter,
    content.voice,
    content.background,
  ]);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(toDraft(content));
    // `stored` captures every field toDraft reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  // Same guard as the whiteboard player: the caller's closure changes on every
  // render, and depending on it would restart the poll each tick.
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    if (!rendering) return;
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    const poll = setInterval(() => {
      void Promise.resolve(refresh.current()).catch(() => {});
    }, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [rendering]);

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const editSection = (i: number, patch: Partial<TrainingSection>) =>
    edit({ sections: draft.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveSection = (i: number, by: -1 | 1) => {
    const next = [...draft.sections];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    edit({ sections: next });
  };

  const save = async (): Promise<boolean> => {
    const res = await fetch(`/api/training/${artifactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        objectives: draft.objectives.split("\n"),
        sections: draft.sections,
        presenter: draft.presenter,
        voice: draft.voice,
        background: draft.background,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(j.error || "Could not save the transcript.");
    setDirty(false);
    await refresh.current();
    return true;
  };

  const run = async (what: "save" | "render") => {
    setBusy(what);
    setError(null);
    try {
      if (dirty) await save();
      if (what === "render") {
        const res = await fetch(`/api/training/${artifactId}/render`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(j.error || "Could not start the render.");
        setElapsed(0);
        await refresh.current();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const wordCount = words(draft.sections);
  const minutes = wordCount / WORDS_PER_MINUTE;
  const tooLong = minutes > MAX_AVATAR_MINUTES * 0.95;
  const cost =
    content.pricePerMinute && content.pricePerMinute > 0
      ? Math.max(1, Math.ceil(minutes)) * content.pricePerMinute
      : null;
  const locked = rendering || busy !== null;

  return (
    <div className="space-y-5">
      {stage === "done" && content.videoUrl && (
        <div>
          <video
            key={content.videoUrl}
            src={content.videoUrl}
            controls
            preload="metadata"
            className="w-full rounded-2xl border border-[var(--border)] bg-black"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
            {content.durationSec ? <span>{fmt(content.durationSec)}</span> : null}
            {content.bytes ? <span>{(content.bytes / 1_048_576).toFixed(1)} MB</span> : null}
            {content.billedSeconds ? (
              <span>{Math.round(content.billedSeconds)} s of avatar time billed</span>
            ) : null}
          </div>
          {(content.editedSinceRender || dirty) && (
            <p className="mt-2 text-[11px] text-amber-200/90">
              The transcript has changed since this video was rendered. Render
              again to update it.
            </p>
          )}
        </div>
      )}

      {rendering && (
        <div className="rounded-2xl border border-[var(--border)] bg-[#0e1116] p-5">
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
            <span className="text-[13px] font-medium">
              {STAGES.find((s) => s.key === stage)?.label ?? "Working"}
            </span>
            <span className="ml-auto font-mono text-[11px] text-[var(--muted)] tabular-nums">
              {fmt(elapsed)}
            </span>
          </div>
          <ol className="mt-3 space-y-1.5">
            {STAGES.map((s, i) => {
              const now = STAGES.findIndex((x) => x.key === stage);
              const state = i < now ? "done" : i === now ? "now" : "todo";
              return (
                <li key={s.key} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      state === "done"
                        ? "bg-[var(--accent)]"
                        : state === "now"
                          ? "animate-pulse bg-[var(--accent)]"
                          : "bg-[#2a313b]"
                    }`}
                  />
                  <span className={state === "todo" ? "text-[#4b5563]" : "text-[var(--muted)]"}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[11px] leading-snug text-[var(--muted)]">
            Azure renders the presenter in the cloud — usually a few minutes
            per minute of video. You can close this; it carries on, and
            survives a server restart.
          </p>
        </div>
      )}

      {stage === "failed" && (
        <p className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-[13px] text-red-200">
          {content.progress?.note ?? "The render failed."}
        </p>
      )}
      {stage !== "failed" && !rendering && content.progress?.note && (
        <p className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-[12px] text-amber-100">
          {content.progress.note}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-[13px] text-red-200">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Presenter
          </h3>
          <select
            aria-label="Presenter"
            className={`${inputCls} !w-auto`}
            value={draft.presenter}
            disabled={locked}
            onChange={(e) =>
              edit({
                presenter: e.target.value,
                voice: AVATAR_PRESETS[e.target.value]?.voice ?? draft.voice,
              })
            }
          >
            {Object.entries(AVATAR_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Voice"
            className={`${inputCls} !w-auto`}
            value={draft.voice}
            disabled={locked}
            onChange={(e) => edit({ voice: e.target.value })}
          >
            {PRESENTER_VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Background"
            className={`${inputCls} !w-auto`}
            value={draft.background}
            disabled={locked}
            onChange={(e) => edit({ background: e.target.value })}
          >
            {BACKGROUNDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="h-6 w-6 rounded-md border border-[var(--border)]"
            style={{ background: draft.background }}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Transcript
          </h3>
          <span
            className={`text-[11px] tabular-nums ${tooLong ? "text-red-300" : "text-[var(--muted)]"}`}
          >
            {wordCount.toLocaleString()} words · about {minutes.toFixed(1)} min
            {cost !== null ? ` · est. $${cost.toFixed(2)}` : ""}
            {tooLong ? ` · over the ${MAX_AVATAR_MINUTES}-minute limit` : ""}
          </span>
        </div>

        <input
          className={`${inputCls} text-[15px] font-semibold`}
          value={draft.title}
          disabled={locked}
          onChange={(e) => edit({ title: e.target.value })}
          aria-label="Title"
        />
        {content.description && (
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">{content.description}</p>
        )}

        <label className="block">
          <span className="mb-1 block text-[10px] tracking-wide text-[var(--muted)] uppercase">
            Learning objectives · one per line, shown here only
          </span>
          <textarea
            className={`${inputCls} min-h-[4.5rem] leading-relaxed`}
            value={draft.objectives}
            disabled={locked}
            onChange={(e) => edit({ objectives: e.target.value })}
          />
        </label>

        <ol className="space-y-3">
          {draft.sections.map((s, i) => (
            <li key={i} className="rounded-xl border border-[var(--border)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-[10px] font-semibold text-[var(--muted)]">
                  {i + 1}
                </span>
                <input
                  className={`${inputCls} font-medium`}
                  value={s.title}
                  disabled={locked}
                  placeholder="Section title"
                  onChange={(e) => editSection(i, { title: e.target.value })}
                  aria-label={`Section ${i + 1} title`}
                />
                <button
                  className="btn !px-2 !py-1 !text-xs"
                  disabled={locked || i === 0}
                  onClick={() => moveSection(i, -1)}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className="btn !px-2 !py-1 !text-xs"
                  disabled={locked || i === draft.sections.length - 1}
                  onClick={() => moveSection(i, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  className="btn !px-2 !py-1 !text-xs hover:text-red-300"
                  disabled={locked || draft.sections.length <= 1}
                  onClick={() => edit({ sections: draft.sections.filter((_, j) => j !== i) })}
                  aria-label="Remove section"
                >
                  ✕
                </button>
              </div>
              <textarea
                className={`${inputCls} min-h-[8rem] leading-relaxed`}
                value={s.text}
                disabled={locked}
                onChange={(e) => editSection(i, { text: e.target.value })}
                aria-label={`Section ${i + 1} script`}
              />
            </li>
          ))}
        </ol>

        <button
          className="btn !text-xs"
          disabled={locked}
          onClick={() => edit({ sections: [...draft.sections, { title: "", text: "" }] })}
        >
          + Add section
        </button>
      </section>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--panel)] px-1 py-3">
        <p className="mr-auto text-[11px] leading-snug text-[var(--muted)]">
          Spoken exactly as written, with subtitles burned in. Avoid markdown,
          links and stage directions.
        </p>
        <button
          className="btn !text-xs"
          disabled={!dirty || locked}
          onClick={() => void run("save")}
        >
          {busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
        <button
          className="btn btn-primary !text-xs"
          disabled={locked || tooLong || wordCount === 0}
          onClick={() => void run("render")}
        >
          {busy === "render"
            ? "Starting…"
            : rendering
              ? "Rendering…"
              : content.videoUrl
                ? "Render again"
                : "Render video"}
        </button>
      </div>
    </div>
  );
}
