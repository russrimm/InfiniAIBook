"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BOOKEND_MODES,
  BOOKEND_MODE_LABELS,
  BOOKEND_SLOTS,
  BOOKEND_SLOT_LABELS,
  DEFAULT_BOOKEND_SECONDS,
  FADES,
  FADE_LABELS,
  MAX_BOOKEND_UPLOAD_BYTES,
  bookendEstimate,
  bookendRequest,
  bookendStatus,
  planBookends,
  type BookendMode,
  type BookendSetting,
  type BookendSlot,
  type Bookends,
} from "@/lib/bookends";
import { MAX_PROMPT_CHARS, VIDEO_SETUP_URL, estimateClipCost, formatUsd, type ClipCapabilities } from "@/lib/videoclip";
import type { CueClipState } from "@/lib/trainingclips";

type VideoStatus = { configured: boolean; reason?: string; capabilities?: ClipCapabilities };
type Budget = { enabled: boolean; remainingCents: number | null };
type Data = {
  kind: "training" | "motion";
  bookends: Bookends;
  slots: Record<BookendSlot, { job: CueClipState | null }>;
  mainSeconds: number | null;
  rendering: boolean;
  video: VideoStatus;
  budget: Budget;
};
type LibraryClip = { artifactId: string; index: number; title: string; prompt: string; seconds: number };

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-well px-2.5 py-1.5 text-[13px] text-[var(--fg)] outline-none placeholder:text-faint focus:border-focus disabled:opacity-60";
const labelCls = "mb-1 block text-[10px] tracking-wide text-[var(--muted)] uppercase";
const RUNNING = new Set(["queued", "in_progress", "downloading"]);
const STATUS_TEXT: Record<CueClipState["status"], string> = {
  queued: "Waiting for the video model",
  in_progress: "Generating the clip",
  downloading: "Downloading the clip",
  completed: "Clip ready",
  failed: "The clip could not be made",
  cancelled: "Cancelled",
};

const seconds = (n: number) => `${Math.round(n * 10) / 10} s`;

/** The clip fields come from the server; everything else is what the person is typing. */
function mergeClips(local: Bookends, server: Bookends): Bookends {
  const out = { ...local };
  for (const slot of BOOKEND_SLOTS) {
    const s = server[slot];
    out[slot] = { ...local[slot], clipId: s.clipId, clipSeconds: s.clipSeconds, clipKey: s.clipKey, label: s.label };
  }
  return out;
}

/**
 * Optional intro and outro clips for a training video or motion explainer. Off
 * by default. Each is made with AI (priced and budgeted before anything is
 * billed), picked from this notebook's clips, or uploaded. A slot that is on
 * always needs its clip: rendering is refused rather than quietly leaving it out.
 */
export default function BookendsEditor({
  artifactId,
  disabled = false,
  mainSecondsHint,
  onProblems,
}: {
  artifactId: string;
  /** True while the video is rendering. */
  disabled?: boolean;
  /** The main video's length when the server does not know it yet. */
  mainSecondsHint?: number;
  /** Told whether a requested intro or outro still lacks its clip. */
  onProblems?: (blocked: boolean) => void;
}) {
  const url = `/api/bookends/${artifactId}`;
  const [data, setData] = useState<Data | null>(null);
  const [local, setLocal] = useState<Bookends | null>(null);
  const [error, setError] = useState<Partial<Record<BookendSlot, string>>>({});
  const [busy, setBusy] = useState<Partial<Record<BookendSlot, string>>>({});
  const [library, setLibrary] = useState<LibraryClip[] | null>(null);
  const [saved, setSaved] = useState("");
  const dirty = useRef(false);
  const clearing = useRef<Set<BookendSlot>>(new Set());
  const problems = useRef(onProblems);
  problems.current = onProblems;

  const load = useCallback(async () => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return;
    const d = (await res.json()) as Data;
    setData(d);
    setLocal((cur) => (cur && dirty.current ? mergeClips(cur, d.bookends) : d.bookends));
  }, [url]);
  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const anyRunning = data ? BOOKEND_SLOTS.some((s) => data.slots[s].job && RUNNING.has(data.slots[s].job!.status)) : false;
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void load().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, [anyRunning, load]);

  const caps = data?.video.configured ? data.video.capabilities : undefined;

  // Settings are saved a moment after the last change, so typing a prompt is not one request per key.
  useEffect(() => {
    if (!local || !dirty.current) return;
    const timer = setTimeout(async () => {
      const clear = [...clearing.current];
      try {
        const res = await fetch(url, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...local, clear }),
        });
        const j = (await res.json().catch(() => ({}))) as { bookends?: Bookends; error?: string };
        if (!res.ok) throw new Error(j.error || "Could not save.");
        clearing.current = new Set();
        dirty.current = false;
        setSaved("Saved");
        void load().catch(() => {});
      } catch (e) {
        setSaved(e instanceof Error ? e.message : "Could not save.");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [local, url, load]);

  const needs = local
    ? BOOKEND_SLOTS.some((s) => local[s].mode !== "off" && !local[s].clipId)
    : false;
  useEffect(() => {
    problems.current?.(needs);
  }, [needs]);

  const edit = (slot: BookendSlot, patch: Partial<BookendSetting>, clear = false) => {
    dirty.current = true;
    if (clear) clearing.current.add(slot);
    setSaved("");
    setLocal((cur) => {
      if (!cur) return cur;
      const next = { ...cur, [slot]: { ...cur[slot], ...patch } };
      if (clear) {
        next[slot] = { ...next[slot], clipId: undefined, clipSeconds: undefined, clipKey: undefined, label: undefined };
      }
      return next;
    });
  };

  const setMode = (slot: BookendSlot, mode: BookendMode) => {
    setError((e) => ({ ...e, [slot]: undefined }));
    // A clip from one source is not kept when the source changes, except by turning the slot off and on again.
    edit(slot, { mode }, mode !== "off" && local?.[slot].mode !== "off");
    if (mode === "library" && !library) {
      void fetch(`${url}/library`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { clips?: LibraryClip[] }) => setLibrary(j.clips ?? []))
        .catch(() => setLibrary([]));
    }
  };

  const flush = async () => {
    // Settings that have not been saved yet must reach the server before an action that reads them.
    if (!local || !dirty.current) return;
    const clear = [...clearing.current];
    const res = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...local, clear }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Could not save.");
    clearing.current = new Set();
    dirty.current = false;
  };

  const act = async (slot: BookendSlot, name: string, run: () => Promise<void>) => {
    setBusy((b) => ({ ...b, [slot]: name }));
    setError((e) => ({ ...e, [slot]: undefined }));
    try {
      await flush();
      await run();
      await load();
    } catch (e) {
      setError((x) => ({ ...x, [slot]: e instanceof Error ? e.message : "Something went wrong." }));
    } finally {
      setBusy((b) => ({ ...b, [slot]: undefined }));
    }
  };

  const post = async (path: string, body: unknown, form?: FormData) => {
    const res = await fetch(`${url}/${path}`, {
      method: "POST",
      ...(form ? { body: form } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(j.error || "That did not work.");
    return j;
  };

  const draft = (slot: BookendSlot) =>
    act(slot, "draft", async () => {
      const j = (await post("prompt", { slot, seconds: local?.[slot].seconds ?? DEFAULT_BOOKEND_SECONDS })) as { prompt: string };
      edit(slot, { prompt: j.prompt });
    });
  const generate = (slot: BookendSlot) =>
    act(slot, "generate", async () => {
      const s = local![slot];
      await post("clip", { slot, prompt: s.prompt, seconds: s.seconds, resolution: s.resolution });
    });
  const cancel = (slot: BookendSlot) => act(slot, "cancel", async () => void (await post("clip", { slot, cancel: true })));
  const upload = (slot: BookendSlot, file: File) =>
    act(slot, "upload", async () => {
      if (file.size > MAX_BOOKEND_UPLOAD_BYTES) throw new Error("That video is larger than 100 MB.");
      const form = new FormData();
      form.set("slot", slot);
      form.set("file", file);
      await post("file", null, form);
      dirty.current = false;
    });
  const chooseLibrary = (slot: BookendSlot, key: string) =>
    act(slot, "library", async () => {
      const [artifactId, index] = key.split(":");
      await post("file", { slot, artifactId, index: Number(index) });
      dirty.current = false;
    });

  if (!data || !local) {
    return (
      <p className="text-[11px] text-[var(--muted)]" role="status">
        Loading the intro and outro…
      </p>
    );
  }

  const locked = disabled || data.rendering;
  const estimate = caps ? bookendEstimate(caps, local) : null;
  const overBudget = Boolean(
    estimate && data.budget.enabled && data.budget.remainingCents !== null && estimate.totalCents > data.budget.remainingCents,
  );
  const main = data.mainSeconds ?? mainSecondsHint ?? null;
  const plan = planBookends(
    main ?? 0,
    local.intro.mode !== "off" ? (local.intro.clipSeconds ?? local.intro.seconds ?? DEFAULT_BOOKEND_SECONDS) : null,
    local.outro.mode !== "off" ? (local.outro.clipSeconds ?? local.outro.seconds ?? DEFAULT_BOOKEND_SECONDS) : null,
    local.fade,
  );

  const tile = (slot: BookendSlot) => {
    const s = local[slot];
    const off = s.mode === "off";
    return (
      <li
        key={slot}
        className={`min-w-0 rounded-md border px-2 py-1.5 text-[11px] ${off ? "border-dashed border-[var(--border)] text-[var(--muted)]" : s.clipId ? "border-[var(--border)] bg-well text-[var(--fg)]" : "border-amber-400/50 bg-well text-amber-200"}`}
        data-testid={`bookend-tile-${slot}`}
      >
        <strong className="block">{BOOKEND_SLOT_LABELS[slot]}</strong>
        {off ? "Off" : `${seconds(s.clipSeconds ?? s.seconds ?? DEFAULT_BOOKEND_SECONDS)}${s.clipId ? "" : " · not made yet"}`}
      </li>
    );
  };

  return (
    <div className="space-y-3" data-testid="bookends-editor">
      <p className="text-[11px] leading-snug text-[var(--muted)]">
        Add a short clip before the first section and after the last. Both are off by default, and nothing is billed unless you
        choose Generate. The clip&apos;s own sound is used if it has any; the music and the presenter play only under the video
        itself, and the watermark covers all of it.
      </p>

      <div>
        <p className={labelCls} id={`${artifactId}-order`}>
          Final order
        </p>
        <ol className="grid grid-cols-[1fr_2fr_1fr] gap-2" aria-labelledby={`${artifactId}-order`} data-testid="bookend-timeline">
          {tile("intro")}
          <li className="min-w-0 rounded-md border border-[var(--border)] px-2 py-1.5 text-[11px]">
            <strong className="block">Video</strong>
            {main ? seconds(main) : "Sections"}
          </li>
          {tile("outro")}
        </ol>
        {main ? (
          <p className="mt-1 text-[11px] text-[var(--muted)]" data-testid="bookend-total">
            Total about {seconds(plan.total)}
            {plan.fade > 0 ? `, with a ${plan.fade} s cross-fade at each join` : ", cut at each join"}.
          </p>
        ) : null}
      </div>

      {data.video.configured === false && (
        <p className="text-[11px] leading-snug text-[var(--muted)]" data-testid="bookend-unconfigured">
          No video model is configured, so a clip cannot be generated here; you can still use a library clip or upload one.{" "}
          <a className="underline" href={VIDEO_SETUP_URL} target="_blank" rel="noreferrer">
            Set one up
          </a>
          .
        </p>
      )}

      {BOOKEND_SLOTS.map((slot) => {
        const s = local[slot];
        const job = data.slots[slot].job;
        const running = job !== null && RUNNING.has(job.status);
        const working = Boolean(busy[slot]);
        const req = caps ? bookendRequest(s, caps) : null;
        const status = bookendStatus(slot, s, caps && req ? { model: caps.model, req } : undefined);
        const failed = job?.status === "failed";
        const err = error[slot] ?? (failed ? `${job?.moderation ? "Declined by the content filter. " : ""}${job?.error ?? ""}` : undefined);
        const frozen = locked || running || working;
        return (
          <fieldset key={slot} className="space-y-2 rounded-md border border-[var(--border)] p-2.5" data-testid={`bookend-${slot}`}>
            <legend className="px-1 text-[13px] font-medium">{BOOKEND_SLOT_LABELS[slot]}</legend>
            <label className="block">
              <span className={labelCls}>Source</span>
              <select
                className={inputCls}
                value={s.mode}
                disabled={locked || running}
                data-testid={`bookend-mode-${slot}`}
                onChange={(e) => setMode(slot, e.target.value as BookendMode)}
              >
                {BOOKEND_MODES.map((m) => (
                  <option key={m} value={m}>
                    {BOOKEND_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>

            {s.mode === "ai" && (
              <div className="space-y-2">
                <label className="block">
                  <span className={labelCls}>Clip prompt</span>
                  <textarea
                    className={`${inputCls} min-h-[4.5rem] resize-y`}
                    value={s.prompt ?? ""}
                    maxLength={MAX_PROMPT_CHARS}
                    disabled={frozen}
                    data-testid={`bookend-prompt-${slot}`}
                    placeholder={
                      slot === "intro"
                        ? "An opening shot for the video. No on-screen text."
                        : "A closing shot for the video. No on-screen text."
                    }
                    onChange={(e) => edit(slot, { prompt: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="btn !text-[11px]"
                  disabled={frozen}
                  data-testid={`bookend-draft-${slot}`}
                  onClick={() => void draft(slot)}
                >
                  {busy[slot] === "draft" ? "Drafting…" : s.prompt ? "Draft another prompt" : "Draft a prompt from the video"}
                </button>
                {caps && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label>
                      <span className={labelCls}>Length</span>
                      <select
                        className={inputCls}
                        value={req?.duration}
                        disabled={frozen}
                        onChange={(e) => edit(slot, { seconds: Number(e.target.value) })}
                      >
                        {caps.durations.map((d) => (
                          <option key={d} value={d}>
                            {d} seconds
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelCls}>Quality</span>
                      <select
                        className={inputCls}
                        value={req?.resolution}
                        disabled={frozen}
                        onChange={(e) => edit(slot, { resolution: e.target.value })}
                      >
                        {caps.resolutions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {caps && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn !text-[11px]"
                      disabled={frozen || !s.prompt?.trim() || overBudget}
                      data-testid={`bookend-generate-${slot}`}
                      onClick={() => void generate(slot)}
                    >
                      {busy[slot] === "generate"
                        ? "Starting…"
                        : `${s.clipId ? "Regenerate" : "Generate"} · ${formatUsd(
                            req ? estimateClipCost(caps, { prompts: [s.prompt || "x"], variants: 1, duration: req.duration, resolution: req.resolution }).totalUsd : 0,
                          )}`}
                    </button>
                    {running && (
                      <button type="button" className="btn !text-[11px]" disabled={working} onClick={() => void cancel(slot)}>
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {s.mode === "library" && (
              <label className="block">
                <span className={labelCls}>Video clip from this notebook</span>
                <select
                  className={inputCls}
                  defaultValue=""
                  disabled={frozen}
                  data-testid={`bookend-library-${slot}`}
                  onChange={(e) => e.target.value && void chooseLibrary(slot, e.target.value)}
                >
                  <option value="">{library === null ? "Loading…" : library.length ? "Choose a clip" : "No clips yet. Make one in Studio"}</option>
                  {(library ?? []).map((c) => (
                    <option key={`${c.artifactId}:${c.index}`} value={`${c.artifactId}:${c.index}`}>
                      {c.title} · clip {c.index + 1} · {c.seconds} s
                    </option>
                  ))}
                </select>
              </label>
            )}

            {s.mode === "upload" && (
              <label className="block">
                <span className={labelCls}>MP4 video, up to 100 MB</span>
                <input
                  type="file"
                  accept="video/mp4"
                  className={inputCls}
                  disabled={frozen}
                  data-testid={`bookend-file-${slot}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload(slot, f);
                  }}
                />
              </label>
            )}

            {s.mode !== "off" && s.clipId && (
              <div className="space-y-2">
                <video
                  key={s.clipId}
                  className="max-h-48 w-full rounded-md bg-black object-contain"
                  src={`${url}/media/${s.clipId}`}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  aria-label={`The ${slot} clip`}
                  data-testid={`bookend-video-${slot}`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-[var(--muted)]">
                    {s.label ?? "Clip"} · {seconds(s.clipSeconds ?? 0)}
                    {status === "stale" ? " · The prompt or options changed since this clip was made. Regenerate to match, or keep it." : ""}
                  </p>
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={Boolean(s.mute)}
                      disabled={locked}
                      onChange={(e) => edit(slot, { mute: e.target.checked })}
                    />
                    Play without its own sound
                  </label>
                </div>
                <button type="button" className="btn !text-[11px]" disabled={frozen} onClick={() => edit(slot, {}, true)}>
                  Remove this clip
                </button>
              </div>
            )}

            <p role="status" aria-live="polite" className="min-h-[1rem] text-[11px] text-[var(--muted)]" data-testid={`bookend-status-${slot}`}>
              {job && RUNNING.has(job.status)
                ? `${STATUS_TEXT[job.status]}${typeof job.progress === "number" && job.progress > 0 && job.progress < 100 ? ` · ${Math.round(job.progress)}%` : ""}${job.note ? ` · ${job.note}` : ""}`
                : s.mode !== "off" && !s.clipId && !err
                  ? "No clip yet. Rendering is blocked until there is one, or the slot is turned off."
                  : ""}
            </p>
            {err && (
              <div role="alert" className="space-y-1.5 text-[11px] leading-snug text-red-300" data-testid={`bookend-error-${slot}`}>
                <p>{err}</p>
                <div className="flex flex-wrap gap-2">
                  {s.mode === "ai" && (
                    <button type="button" className="btn !text-[11px]" disabled={frozen || !s.prompt?.trim()} onClick={() => void generate(slot)}>
                      Try again
                    </button>
                  )}
                  <button type="button" className="btn !text-[11px]" disabled={locked || running} onClick={() => setMode(slot, "off")}>
                    Render without it
                  </button>
                </div>
                <p className="text-[var(--muted)]">Or choose another source above.</p>
              </div>
            )}
          </fieldset>
        );
      })}

      <label className="block">
        <span className={labelCls}>Join</span>
        <select
          className={inputCls}
          value={local.fade}
          disabled={locked}
          data-testid="bookend-fade"
          onChange={(e) => {
            dirty.current = true;
            setSaved("");
            setLocal({ ...local, fade: e.target.value as Bookends["fade"] });
          }}
        >
          {FADES.map((f) => (
            <option key={f} value={f}>
              {FADE_LABELS[f]}
            </option>
          ))}
        </select>
      </label>

      {estimate && estimate.items.length > 0 && (
        <p className="text-[11px] leading-snug text-[var(--muted)]" data-testid="bookend-estimate">
          Estimated cost to make {estimate.items.map((i) => i.slot).join(" and ")}: <strong>{formatUsd(estimate.totalUsd)}</strong>.{" "}
          {caps?.priceNote}
          {data.budget.enabled && data.budget.remainingCents !== null ? ` Today's budget has ${formatUsd(data.budget.remainingCents / 100)} left.` : ""}
        </p>
      )}
      {overBudget && (
        <p role="alert" className="text-[11px] text-red-300">
          That is more than today&apos;s remaining budget.
        </p>
      )}
      <p role="status" aria-live="polite" className="min-h-[1rem] text-[10px] text-[var(--muted)]" data-testid="bookend-saved">
        {saved}
      </p>
    </div>
  );
}
