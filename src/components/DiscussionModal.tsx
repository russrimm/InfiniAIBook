"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DISCUSSION_MODES,
  DISCUSSION_VOICES,
  MODES,
  citedLine,
  hostName,
  quickActionsFor,
  scoreLine,
  type DiscussionMode,
  type DiscussionSetup,
  type DiscussionVoice,
} from "@/lib/discussion";
import { savedTurns, usedCitations, type DiscussionState } from "@/lib/discussionState";
import type { Note } from "@/lib/types";
import { InlineCited } from "./Markdown";
import { useDiscussion } from "./useDiscussion";

const VERDICT: Record<string, { mark: string; tone: string }> = {
  correct: { mark: "✅", tone: "border-emerald-800/60 bg-emerald-950/30" },
  partly: { mark: "🟡", tone: "border-amber-800/60 bg-amber-950/30" },
  incorrect: { mark: "❌", tone: "border-rose-800/60 bg-rose-950/30" },
};

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function useElapsed(since: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since || !running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since, running]);
  return since ? clock(now - since) : "0:00";
}

/** The AI's presence: a voice-reactive orb with its name. */
function HostOrb({ name, level, speaking, size = 132 }: { name: string; level: number; speaking: boolean; size?: number }) {
  const scale = 1 + Math.min(0.22, level * 0.35);
  return (
    <div className="relative grid place-items-center" style={{ width: size + 40, height: size + 40 }}>
      {speaking && (
        <span
          aria-hidden
          className="absolute rounded-full border-2 border-[var(--accent)]/50 motion-safe:animate-ping"
          style={{ width: size, height: size }}
        />
      )}
      <div
        className="grid place-items-center rounded-full text-3xl font-semibold text-white transition-transform duration-75"
        style={{
          width: size,
          height: size,
          transform: `scale(${scale})`,
          background: "radial-gradient(circle at 30% 30%, #a5b4fc, var(--accent) 45%, #312e81)",
          boxShadow: speaking ? "0 0 40px rgba(124,140,255,.45)" : "0 0 0 1px rgba(255,255,255,.08)",
        }}
      >
        {name.charAt(0)}
      </div>
    </div>
  );
}

function Transcript({
  state,
  host,
  follow,
}: {
  state: DiscussionState;
  host: string;
  follow: boolean;
}) {
  const endRef = useRef<HTMLLIElement>(null);
  const last = state.turns.at(-1);
  useEffect(() => {
    if (follow) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [follow, state.turns.length, last?.text, state.notices.length]);

  const noticesAfter = (id: string | null) => state.notices.filter((n) => n.afterTurnId === id);
  const pill = (text: string, key: string) => (
    <li key={key} className="flex justify-center">
      <span className="rounded-full bg-[#1e2430] px-3 py-1 text-[11px] text-[var(--muted)]">{text}</span>
    </li>
  );

  return (
    <ol className="space-y-4" aria-live={follow ? "polite" : undefined}>
      {noticesAfter(null).map((n) => pill(n.text, n.id))}
      {state.turns.map((t) => {
        const mine = t.role === "user";
        const results = state.results.filter((r) => r.turnId === t.id);
        return [
          <li key={t.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
            <div className="mb-1 flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <span className="font-medium text-[var(--fg)]/80">{mine ? "You" : host}</span>
              <span className="tabular-nums">{clock(t.at)}</span>
              {t.typed && <span>typed</span>}
              {t.interrupted && <span className="italic">cut off</span>}
            </div>
            <div
              dir="auto"
              className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                mine
                  ? "rounded-tr-sm bg-[var(--accent)]/90 text-white"
                  : "rounded-tl-sm border border-[var(--border)] bg-[var(--panel-2)]"
              }`}
            >
              {t.text ? (
                <InlineCited text={citedLine(t.text, t.cites)} citations={state.citations} />
              ) : (
                <span className="inline-flex gap-1 opacity-70" aria-label="Listening">
                  <span className="typing-dot">•</span>
                  <span className="typing-dot">•</span>
                  <span className="typing-dot">•</span>
                </span>
              )}
            </div>
            {results.map((r, i) => (
              <div
                key={i}
                className={`mt-1.5 max-w-[88%] rounded-lg border px-3 py-2 text-[12px] ${VERDICT[r.verdict].tone}`}
              >
                <span className="mr-1">{VERDICT[r.verdict].mark}</span>
                {r.feedback || r.question}
              </div>
            ))}
          </li>,
          ...noticesAfter(t.id).map((n) => pill(n.text, n.id)),
        ];
      })}
      <li ref={endRef} aria-hidden className="h-0" />
    </ol>
  );
}

function SetupView({
  setup,
  onChange,
  sourceCount,
  readiness,
  onStart,
  error,
}: {
  setup: DiscussionSetup;
  onChange: (patch: Partial<DiscussionSetup>) => void;
  sourceCount: number;
  readiness: { ready: boolean; problem?: string } | null;
  onStart: () => void;
  error: string | null;
}) {
  const m = MODES[setup.mode];
  return (
    <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[1fr_260px]">
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Kind of conversation
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DISCUSSION_MODES.map((id) => {
              const spec = MODES[id];
              const on = setup.mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ mode: id as DiscussionMode })}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border)] hover:border-[#3a4352]"
                  }`}
                >
                  <span className="text-xl leading-none">{spec.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{spec.label}</span>
                    <span className="block text-[11px] leading-snug text-[var(--muted)]">{spec.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {setup.mode === "debate" && (
          <label className="block space-y-1.5">
            <span className="text-[12px] text-[var(--muted)]">Your position (leave empty to let the AI propose one)</span>
            <input
              className="input"
              maxLength={300}
              value={setup.stance ?? ""}
              onChange={(e) => onChange({ stance: e.target.value })}
              placeholder="e.g. Remote work makes teams more productive"
            />
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-[12px] text-[var(--muted)]">Focus (optional)</span>
          <input
            className="input"
            maxLength={300}
            value={setup.focus ?? ""}
            onChange={(e) => onChange({ focus: e.target.value })}
            placeholder="e.g. the funding risks in chapter 3"
          />
        </label>

        <label className="block max-w-xs space-y-1.5">
          <span className="text-[12px] text-[var(--muted)]">Voice</span>
          <select
            className="input"
            value={setup.voice}
            onChange={(e) => onChange({ voice: e.target.value as DiscussionVoice })}
          >
            {DISCUSSION_VOICES.map((v) => (
              <option key={v} value={v}>
                {hostName(v)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-5 text-center md:self-start">
        <HostOrb name={hostName(setup.voice)} level={0} speaking={false} size={96} />
        <div>
          <div className="font-semibold">{hostName(setup.voice)}</div>
          <div className="text-[12px] text-[var(--muted)]">
            {m.icon} {m.label} · {sourceCount} source{sourceCount === 1 ? "" : "s"}
          </div>
        </div>
        {readiness && !readiness.ready && (
          <p role="alert" className="rounded-lg border border-amber-900/60 bg-amber-950/30 p-2 text-left text-[12px] text-amber-100">
            {readiness.problem}
          </p>
        )}
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!sourceCount || (readiness ? !readiness.ready : false)}
          onClick={onStart}
        >
          Start talking
        </button>
        {!sourceCount && <p className="text-[12px] text-[var(--muted)]">Select at least one source first.</p>}
        {error && (
          <p role="alert" className="text-left text-[12px] text-rose-300">
            {error}
          </p>
        )}
        <p className="text-[11px] leading-snug text-[var(--muted)]">
          Uses your microphone. Just talk, and interrupt any time. Headphones keep the AI from hearing itself.
        </p>
      </div>
    </div>
  );
}

export default function DiscussionModal({
  notebookId,
  sourceIds,
  initialFocus,
  onClose,
  onSaved,
}: {
  notebookId: string;
  sourceIds: string[];
  initialFocus?: string;
  onClose: () => void;
  onSaved: (note: Note) => void;
}) {
  const [setup, setSetup] = useState<DiscussionSetup>({
    mode: "discussion",
    voice: "marin",
    focus: initialFocus?.trim() || undefined,
  });
  const [readiness, setReadiness] = useState<{ ready: boolean; problem?: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Selection changes mid-call must not change what this call searches.
  const [callSources] = useState(sourceIds);

  const cleanSetup = useMemo<DiscussionSetup>(
    () => ({
      ...setup,
      focus: setup.focus?.trim() || undefined,
      stance: setup.mode === "debate" ? setup.stance?.trim() || undefined : undefined,
    }),
    [setup]
  );
  const call = useDiscussion({ notebookId, sourceIds: callSources, setup: cleanSetup });
  const { state, status } = call;
  const host = hostName(setup.voice);
  const elapsed = useElapsed(state.connectedAt, status === "live");
  const live = status === "live";
  const inCall = status === "connecting" || live;
  const hasTalk = state.turns.some((t) => t.text.trim());

  useEffect(() => {
    fetch("/api/discussion")
      .then((r) => r.json())
      .then(setReadiness)
      .catch(() => setReadiness(null));
  }, []);

  const close = () => {
    if (inCall && !confirm("End the discussion?")) return;
    if (status === "ended" && hasTalk && !saved && !confirm("Close without saving this discussion to your notes?")) return;
    call.end();
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/discussion/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebookId,
          setup: cleanSetup,
          turns: savedTurns(state),
          citations: usedCitations(state),
          results: state.results.map(({ question, verdict, feedback }) => ({ question, verdict, feedback })),
          durationSec: call.durationSec(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { note?: Note; error?: string; warning?: string };
      if (!res.ok || !data.note) throw new Error(data.error || "Could not save the discussion.");
      setSaved(true);
      if (data.warning) setSaveError(data.warning);
      onSaved(data.note);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const statusLine = !live
    ? call.phase || (status === "ended" ? "Call ended" : "")
    : call.searching
      ? "Checking the sources…"
      : state.assistantSpeaking
        ? "Speaking"
        : state.userSpeaking
          ? "Listening to you"
          : state.responseActive
            ? "Thinking…"
            : "Listening";
  const score = scoreLine(state.results);
  const m = MODES[setup.mode];

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Live discussion"
        className="fade-up flex h-full w-full max-w-5xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <span className="text-xl">🎙️</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">
              Live discussion
              {status !== "idle" && status !== "error" && (
                <span className="font-normal text-[var(--muted)]">
                  {" "}
                  · {m.icon} {m.label} with {host}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              A spoken conversation grounded in your selected sources, with citations.
            </p>
          </div>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={close}>
            ✕
          </button>
        </header>

        {status === "idle" || status === "error" ? (
          <SetupView
            setup={setup}
            onChange={(patch) => setSetup((s) => ({ ...s, ...patch }))}
            sourceCount={callSources.length}
            readiness={readiness}
            onStart={() => void call.start()}
            error={call.error}
          />
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[280px_minmax(0,1fr)]">
            <section
              aria-label={`Call with ${host}`}
              className="flex flex-col items-center gap-3 overflow-y-auto border-[var(--border)] p-5 md:border-r"
            >
              <div className="flex w-full items-center justify-between text-[11px] text-[var(--muted)]">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400" : status === "ended" ? "bg-[var(--muted)]" : "bg-amber-400"}`}
                  />
                  {live ? "Live" : status === "ended" ? "Ended" : "Connecting"}
                </span>
                <span className="tabular-nums">{elapsed}</span>
              </div>
              <HostOrb name={host} level={call.levels.ai} speaking={state.assistantSpeaking} />
              <div className="text-center">
                <div className="text-lg font-semibold">{host}</div>
                <div className="text-[12px] text-[var(--muted)]" aria-live="polite">
                  {statusLine}
                </div>
              </div>
              {score && <div className="rounded-full bg-[#1e2430] px-3 py-1 text-[12px]">Score {score}</div>}

              {status !== "ended" ? (
                <>
                  <div className="flex items-center gap-4 py-1">
                    <button
                      type="button"
                      onClick={call.toggleMute}
                      disabled={!live}
                      aria-pressed={call.muted}
                      aria-label={call.muted ? "Unmute microphone" : "Mute microphone"}
                      className={`relative grid h-12 w-12 place-items-center rounded-full border transition disabled:opacity-40 ${
                        call.muted
                          ? "border-white bg-white text-black"
                          : "border-[var(--border)] bg-[#1e2430] hover:bg-[#262d3a]"
                      }`}
                    >
                      {call.muted ? "🔇" : "🎙️"}
                      {!call.muted && (
                        <span
                          aria-hidden
                          className="absolute inset-0 rounded-full border-2 border-emerald-400"
                          style={{ opacity: Math.min(1, call.levels.user * 2) }}
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={call.end}
                      aria-label={live ? "End discussion" : "Cancel"}
                      className="grid h-12 w-12 place-items-center rounded-full bg-rose-600 text-white transition hover:bg-rose-500"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {quickActionsFor(setup.mode).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="btn !px-2.5 !py-1 !text-[11px]"
                        disabled={!live}
                        onClick={() => call.quick(a.id)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <form
                    className="mt-1 flex w-full gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      call.sendText(draft);
                      setDraft("");
                    }}
                  >
                    <input
                      className="input !py-1.5 !text-[12px]"
                      placeholder="Or type instead…"
                      value={draft}
                      disabled={!live}
                      maxLength={2000}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button className="btn !px-2.5 !text-[11px]" disabled={!live || !draft.trim()}>
                      Send
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex w-full flex-col gap-2 pt-2">
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={!hasTalk || saving || saved}
                    onClick={() => void save()}
                  >
                    {saved ? "Saved to notes ✓" : saving ? "Writing takeaways…" : "Save to notes"}
                  </button>
                  <button
                    type="button"
                    className="btn w-full"
                    onClick={() => {
                      if (hasTalk && !saved && !confirm("Start over without saving this discussion?")) return;
                      setSaved(false);
                      setSaveError(null);
                      void call.start();
                    }}
                  >
                    Talk again
                  </button>
                  <p className="text-[11px] leading-snug text-[var(--muted)]">
                    Saving adds a note with AI takeaways, the full transcript and its citations.
                  </p>
                </div>
              )}
              {(call.error || saveError) && (
                <p role="alert" className="text-center text-[12px] text-rose-300">
                  {call.error || saveError}
                </p>
              )}
            </section>

            <section aria-label="Transcript" className="min-h-0 overflow-y-auto p-5">
              {call.warning && (
                <div
                  role="status"
                  className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[12px] text-amber-100"
                >
                  <span>{call.warning}</span>
                  <button type="button" aria-label="Dismiss" onClick={call.dismissWarning}>
                    ✕
                  </button>
                </div>
              )}
              {state.turns.length === 0 ? (
                <p className="pt-10 text-center text-[13px] text-[var(--muted)]">
                  {live ? `${host} is about to speak…` : call.phase || "Connecting…"}
                </p>
              ) : (
                <Transcript state={state} host={host} follow={status !== "ended"} />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
