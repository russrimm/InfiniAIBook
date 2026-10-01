"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "./Markdown";
import { captureUnsupportedReason, useScreenCapture } from "./useScreenCapture";
import {
  WATCH_DEFAULTS,
  frameDiff,
  sessionNote,
  shouldWatch,
  type Box,
  type ReplyStatus,
  type Trigger,
} from "@/lib/screenhelp";
import { scrollBehavior } from "@/lib/reducedMotion";
import type { Note } from "@/lib/types";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  step?: string | null;
  /** Step number shown on the highlight, counted across the session. */
  stepNo?: number;
  target?: Box | null;
  status?: ReplyStatus;
  frame?: { dataUrl: string; width: number; height: number };
  auto?: boolean;
  error?: boolean;
};

type Reply = {
  status: ReplyStatus;
  say: string;
  step: string | null;
  target: Box | null;
  error?: string;
  code?: string;
};

let seq = 0;
const nextId = () => `t${++seq}`;

/** Plain text for speech: Markdown markers read aloud are noise. */
const speakable = (md: string) => md.replace(/[*_`#>[\]()]/g, "").replace(/\s+/g, " ").trim();

/** Keep the step badge inside the screenshot, which clips its overflow. */
function badgePlacement(b: Box): string {
  const nearTop = b.y < 0.05;
  const nearLeft = b.x < 0.05;
  if (nearTop && nearLeft) return "top-0.5 left-0.5";
  if (nearTop) return "top-0 right-full mr-1";
  return "-top-3 -left-3";
}

function labelPlacement(b: Box): string {
  const vertical = b.y + b.h > 0.9 ? "bottom-full mb-1" : "top-full mt-1";
  const horizontal = b.x > 0.7 ? "right-0" : "left-0";
  return `${vertical} ${horizontal}`;
}

export default function ScreenHelperModal({
  notebookId,
  onClose,
  onSaved,
}: {
  /** When set, the session can be saved as a note in this notebook. */
  notebookId?: string;
  onClose: () => void;
  onSaved?: (note: Note) => void;
}) {
  const capture = useScreenCapture();
  const { state: shareState, grab, start, stop, setError: setCaptureError } = capture;
  const sharing = shareState === "sharing";

  const [goal, setGoal] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState<Trigger | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoWatch, setAutoWatch] = useState(true);
  const [speak, setSpeak] = useState(false);
  const [watchNote, setWatchNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);

  const turnsRef = useRef<Turn[]>([]);
  const goalRef = useRef<string | null>(null);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastAnalyzed = useRef<Uint8Array | null>(null);
  const prevSample = useRef<Uint8Array | null>(null);
  const lastRequestAt = useRef(0);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const baseTitle = useRef<string | null>(null);

  useEffect(() => setUnsupported(captureUnsupportedReason()), []);

  const setAllTurns = useCallback((next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);
  const addTurn = useCallback(
    (t: Turn) => setAllTurns([...turnsRef.current, t]),
    [setAllTurns]
  );

  const close = useCallback(() => {
    abortRef.current?.abort();
    stop("idle");
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    onClose();
  }, [onClose, stop]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [close]);

  // Restore the tab title flagged while the user was in the shared app.
  useEffect(() => {
    const restore = () => {
      if (!document.hidden && baseTitle.current !== null) {
        document.title = baseTitle.current;
        baseTitle.current = null;
      }
    };
    document.addEventListener("visibilitychange", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      restore();
    };
  }, []);

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = capture.stream;
  }, [capture.stream, selectedId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: scrollBehavior() });
  }, [turns, busy]);

  const announce = useCallback(
    (t: Turn) => {
      if (speak && typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(speakable(t.step || t.text)));
      }
      if (document.hidden) {
        if (baseTitle.current === null) baseTitle.current = document.title;
        document.title = `● New step · ${baseTitle.current}`;
      }
    },
    [speak]
  );

  const ask = useCallback(
    async (trigger: Trigger, message?: string) => {
      if (inFlight.current) return;
      const g = goalRef.current ?? message?.trim() ?? "";
      if (!g) return;
      const frame = grab();
      if (!frame) {
        setCaptureError("Share your screen first, so the helper can see the app.");
        return;
      }

      if (!goalRef.current) {
        goalRef.current = g;
        setGoal(g);
      }
      const history = turnsRef.current
        .filter((t) => !t.error && t.text.trim())
        .map((t) => ({
          role: t.role,
          text: t.role === "assistant" && t.step && !t.text.includes(t.step) ? `${t.text}\n\nNext step: ${t.step}` : t.text,
        }));
      if (trigger === "ask" && message) addTurn({ id: nextId(), role: "user", text: message.trim() });

      inFlight.current = true;
      setBusy(trigger);
      lastRequestAt.current = Date.now();
      lastAnalyzed.current = frame.thumb;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/screen-help", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            goal: g,
            message: trigger === "ask" ? message?.trim() : undefined,
            trigger,
            history,
            frame: frame.dataUrl,
            width: frame.width,
            height: frame.height,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as Reply;
        if (!res.ok) throw Object.assign(new Error(data.error || "The helper could not read the screen."), { code: data.code });

        if (data.status === "unchanged" && trigger === "watch") {
          setWatchNote(`Checked at ${new Date().toLocaleTimeString("en-US", { timeStyle: "short" })}: no new step yet.`);
          return;
        }
        setWatchNote(null);
        const priorSteps = turnsRef.current.filter((t) => t.stepNo).length;
        const turn: Turn = {
          id: nextId(),
          role: "assistant",
          text: data.say || "Nothing has changed yet. Take the step above, then ask again.",
          step: data.step,
          stepNo: data.step ? priorSteps + 1 : undefined,
          target: data.target,
          status: data.status,
          frame: { dataUrl: frame.dataUrl, width: frame.width, height: frame.height },
          auto: trigger === "watch",
        };
        addTurn(turn);
        setSelectedId(turn.id);
        announce(turn);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        const msg = e instanceof Error ? e.message : String(e);
        const code = (e as { code?: string }).code;
        if (trigger === "watch") {
          // A configuration problem will not fix itself on the next sample.
          if (code === "vision" || code === "auth" || code === "no_config") setAutoWatch(false);
          setWatchNote(`Auto-watch: ${msg}`);
        } else {
          addTurn({ id: nextId(), role: "assistant", text: msg, error: true });
        }
      } finally {
        inFlight.current = false;
        abortRef.current = null;
        setBusy(null);
      }
    },
    [addTurn, announce, setCaptureError, grab]
  );

  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

  // Auto-watch: sample a thumbnail and ask only when the screen has changed
  // since the frame last analyzed and has stopped moving.
  useEffect(() => {
    if (!sharing || !autoWatch || !goal) return;
    const timer = setInterval(() => {
      const sample = grab({ full: false });
      if (!sample) return;
      const fromAnalyzed = lastAnalyzed.current ? frameDiff(sample.thumb, lastAnalyzed.current) : 1;
      const fromPrev = prevSample.current ? frameDiff(sample.thumb, prevSample.current) : 1;
      prevSample.current = sample.thumb;
      if (
        shouldWatch({
          enabled: true,
          hasGoal: true,
          inFlight: inFlight.current,
          sinceLastRequestMs: Date.now() - lastRequestAt.current,
          changedFromAnalyzed: fromAnalyzed,
          changedFromPrevSample: fromPrev,
        })
      ) {
        void askRef.current("watch");
      }
    }, WATCH_DEFAULTS.sampleMs);
    return () => clearInterval(timer);
  }, [sharing, autoWatch, goal, grab]);

  const submit = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!sharing) {
      const ok = await start();
      if (!ok) return;
      // The first decoded frame can lag the stream starting by a moment.
      await new Promise((r) => setTimeout(r, 400));
    }
    setInput("");
    await ask("ask", text);
  };

  const startOver = () => {
    abortRef.current?.abort();
    goalRef.current = null;
    setGoal(null);
    setAllTurns([]);
    setSelectedId(null);
    setWatchNote(null);
    setSavedNote(false);
    setSaveError(null);
    lastAnalyzed.current = null;
  };

  const save = async () => {
    if (!notebookId || !goal) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { title, content } = sessionNote({
        goal,
        turns: turns.filter((t) => !t.error),
        date: new Date(),
      });
      const res = await fetch(`/api/notebooks/${notebookId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, kind: "ai" }),
      });
      const data = (await res.json().catch(() => ({}))) as { note?: Note; error?: string };
      if (!res.ok || !data.note) throw new Error(data.error || "Could not save the session.");
      setSavedNote(true);
      onSaved?.(data.note);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const selected = useMemo(
    () => turns.find((t) => t.id === selectedId && t.frame) ?? null,
    [turns, selectedId]
  );
  const hasAnswers = turns.some((t) => t.role === "assistant" && !t.error);
  const error = capture.error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-helper-title"
        className="fade-up flex h-full w-full max-w-6xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <span className="text-xl" aria-hidden>
            🖥️
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="screen-helper-title" className="truncate text-[15px] font-semibold">
              Screen helper
              {goal && <span className="font-normal text-[var(--muted)]"> · {goal}</span>}
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              Share an app, say what you are trying to do, and get coached one step at a time.
            </p>
          </div>
          <span
            className="hidden items-center gap-1.5 text-[11px] text-[var(--muted)] sm:flex"
            aria-live="polite"
          >
            <span
              className={`h-2 w-2 rounded-full ${sharing ? "bg-emerald-400" : shareState === "starting" ? "bg-amber-400" : "bg-[var(--muted)]"}`}
            />
            {sharing ? "Sharing" : shareState === "starting" ? "Choose what to share…" : shareState === "stopped" ? "Sharing stopped" : "Not sharing"}
          </span>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={close}>
            ✕
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
          <section
            aria-label="Shared screen"
            className="flex min-h-0 flex-col gap-3 overflow-y-auto border-[var(--border)] p-4 md:border-r"
          >
            {selected?.frame ? (
              <>
                <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>
                    What the helper saw{selected.stepNo ? ` for step ${selected.stepNo}` : ""}
                    {selected.target ? " · the box is approximate" : ""}
                  </span>
                  {sharing && (
                    <button className="underline hover:text-[var(--fg)]" onClick={() => setSelectedId(null)}>
                      Show live view
                    </button>
                  )}
                </div>
                <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL */}
                  <img
                    src={selected.frame.dataUrl}
                    alt="Screenshot the helper analyzed"
                    className="block h-auto w-full"
                  />
                  {selected.target && (
                    <div
                      data-testid="screen-highlight"
                      aria-label={`Step ${selected.stepNo ?? ""}: ${selected.target.label || "here"}`}
                      className="pointer-events-none absolute rounded-md border-2 border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                      style={{
                        left: `${selected.target.x * 100}%`,
                        top: `${selected.target.y * 100}%`,
                        width: `${selected.target.w * 100}%`,
                        height: `${selected.target.h * 100}%`,
                      }}
                    >
                      <span
                        className={`absolute grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-[12px] font-bold text-black ${badgePlacement(selected.target)}`}
                      >
                        {selected.stepNo ?? "•"}
                      </span>
                      {selected.target.label && (
                        <span
                          className={`absolute max-w-[16rem] truncate rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-medium text-black ${labelPlacement(selected.target)}`}
                        >
                          {selected.target.label}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : sharing ? (
              <>
                <div className="text-[11px] text-[var(--muted)]">Live view of what you are sharing</div>
                <video
                  ref={previewRef}
                  aria-label="Live view of the shared screen"
                  autoPlay
                  muted
                  playsInline
                  className="w-full rounded-xl border border-[var(--border)] bg-black"
                />
              </>
            ) : (
              <div className="m-auto max-w-md text-center">
                <div className="mb-3 text-4xl" aria-hidden>
                  🧭
                </div>
                <h3 className="text-[15px] font-semibold">Get help with the app on your screen</h3>
                <ol className="mt-3 space-y-1.5 text-left text-[13px] text-[var(--muted)]">
                  <li>1. Type what you are trying to do, like “Add a column filter in this spreadsheet.”</li>
                  <li>2. Choose the app window to share. Sharing one window works better than the whole screen.</li>
                  <li>3. Follow the highlighted step. With auto-watch on, the helper notices when you have done it.</li>
                </ol>
                <p className="mt-4 rounded-lg border border-[var(--border)] bg-well p-3 text-left text-[12px] text-[var(--muted)]">
                  🔒 Screenshots go to your configured vision model (Models → Image reading) only while you
                  share, and are never stored. Avoid sharing passwords or other secrets.
                </p>
                {(unsupported || error) && (
                  <p role="alert" className="mt-3 text-[12px] text-rose-300">
                    {unsupported || error}
                  </p>
                )}
                {shareState === "stopped" && !error && (
                  <button className="btn mt-4" onClick={() => void start()}>
                    Share again
                  </button>
                )}
              </div>
            )}
          </section>

          <section aria-label="Conversation" className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2 text-[12px]">
              <label className="flex items-center gap-1.5" title="Check the screen every few seconds and suggest the next step when it changes">
                <input type="checkbox" checked={autoWatch} onChange={(e) => setAutoWatch(e.target.checked)} />
                Auto-watch
              </label>
              <label className="flex items-center gap-1.5" title="Read each new step aloud, handy while you work in the other app">
                <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
                Read steps aloud
              </label>
              <span className="flex-1" />
              {sharing ? (
                <button className="btn !px-2 !py-1 !text-[11px]" onClick={() => stop("stopped")}>
                  Stop sharing
                </button>
              ) : (
                goal && (
                  <button className="btn !px-2 !py-1 !text-[11px]" onClick={() => void start()}>
                    Share screen
                  </button>
                )
              )}
              {goal && (
                <button className="btn !px-2 !py-1 !text-[11px]" onClick={startOver}>
                  Start over
                </button>
              )}
              {notebookId && hasAnswers && (
                <button
                  className="btn !px-2 !py-1 !text-[11px]"
                  disabled={saving || savedNote}
                  onClick={() => void save()}
                >
                  {savedNote ? "Saved as note" : saving ? "Saving…" : "Save as note"}
                </button>
              )}
            </div>

            <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
              {turns.length === 0 && (
                <p className="text-[12px] text-[var(--muted)]">
                  Tell the helper what you need, and it will look at your screen.
                </p>
              )}
              {turns.map((t) =>
                t.role === "user" ? (
                  <div key={t.id} className="ml-8 rounded-xl bg-hover px-3 py-2 text-[13px]">
                    {t.text}
                  </div>
                ) : (
                  <div
                    key={t.id}
                    data-testid="helper-turn"
                    className={`mr-4 rounded-xl border px-3 py-2 text-[13px] ${
                      t.error
                        ? "border-rose-900/60 bg-rose-950/30 text-rose-200"
                        : t.id === selectedId
                          ? "border-amber-400/60 bg-well"
                          : "border-[var(--border)] bg-well"
                    }`}
                  >
                    {t.auto && (
                      <div className="mb-1 text-[11px] text-[var(--muted)]">👀 Noticed a change on your screen</div>
                    )}
                    {t.status === "done" && <div className="mb-1 text-[11px] text-emerald-300">✓ Looks done</div>}
                    {t.error ? <p role="alert">{t.text}</p> : <Markdown>{t.text}</Markdown>}
                    {t.step && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-400/10 px-2 py-1.5">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-400 text-[11px] font-bold text-black">
                          {t.stepNo}
                        </span>
                        <span className="text-[13px]">{t.step}</span>
                      </div>
                    )}
                    {t.frame && t.id !== selectedId && (
                      <button
                        className="mt-1.5 text-[11px] text-[var(--muted)] underline hover:text-[var(--fg)]"
                        onClick={() => setSelectedId(t.id)}
                      >
                        Show on screenshot
                      </button>
                    )}
                  </div>
                )
              )}
              {busy && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
                  <span className="spinner" aria-hidden />
                  {busy === "watch" ? "Your screen changed. Taking a look…" : "Looking at your screen…"}
                </div>
              )}
              {watchNote && !busy && <div className="text-[11px] text-[var(--muted)]">{watchNote}</div>}
              {saveError && (
                <p role="alert" className="text-[12px] text-rose-300">
                  {saveError}
                </p>
              )}
              {error && (sharing || goal) && (
                <p role="alert" className="text-[12px] text-rose-300">
                  {error}
                </p>
              )}
            </div>

            <form
              className="flex shrink-0 flex-col gap-2 border-t border-[var(--border)] p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {goal && sharing && (
                <div className="flex flex-wrap gap-1.5">
                  {["I did that. What's next?", "I can't find it.", "What does this screen do?"].map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="btn !px-2 !py-1 !text-[11px]"
                      disabled={!!busy}
                      onClick={() => void ask("ask", q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  aria-label={goal ? "Ask a follow-up" : "What do you need help with?"}
                  className="input min-h-[2.5rem] flex-1 resize-none !text-[13px]"
                  rows={2}
                  maxLength={1000}
                  placeholder={
                    goal
                      ? "Ask a follow-up, or describe what happened…"
                      : "What do you need help with? For example, “Share this document with my team.”"
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary shrink-0"
                  disabled={!input.trim() || !!busy || !!unsupported || shareState === "starting"}
                >
                  {sharing ? "Ask" : "Share screen & ask"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
