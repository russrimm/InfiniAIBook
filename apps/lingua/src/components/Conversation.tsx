"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConversation } from "@/lib/client/useConversation";
import { indexCorrections, indexNotices } from "@/lib/conversation";
import { shortName } from "@/lib/personas";
import type { ResolvedSetup, Setup } from "@/lib/setup";
import { PersonaPortrait } from "./PersonaPortrait";
import { Transcript } from "./Transcript";

function useClock(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return "0:00";
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function HelpButton({
  onClick,
  children,
  disabled,
  pressed,
  hint,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={hint}
      className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
        pressed ? "border-accent bg-accentsoft text-accent" : "border-line bg-surface hover:border-ink/30"
      }`}
    >
      {children}
    </button>
  );
}

export function Conversation({ setup, resolved }: { setup: Setup; resolved: ResolvedSetup }) {
  const router = useRouter();
  const call = useConversation(setup, resolved);
  const { state, status, policy, levels, setGloss } = call;
  const [showGloss, setShowGloss] = useState(true);
  const [glossError, setGlossError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());
  const clock = useClock(state.connectedAt);
  const p = resolved.persona;
  const name = shortName(p);
  const live = status === "live";

  // Translate each finished partner line into the learner's own language.
  useEffect(() => {
    if (!showGloss || glossError) return;
    for (const t of state.turns) {
      if (t.role !== "partner" || t.pending || !t.text || t.gloss || requested.current.has(t.id)) continue;
      if (t.lang === resolved.support.code) continue;
      requested.current.add(t.id);
      fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t.text, from: resolved.target.code, to: resolved.support.code }),
      })
        .then(async (r) => {
          const data = (await r.json()) as { translation?: string; error?: string; code?: string };
          if (r.ok && data.translation) setGloss(t.id, data.translation);
          else if (data.code === "not_configured") setGlossError(data.error ?? "Translations are not configured.");
          else requested.current.delete(t.id);
        })
        .catch(() => requested.current.delete(t.id));
    }
  }, [state.turns, showGloss, glossError, resolved.support.code, resolved.target.code, setGloss]);

  const hangUp = async () => {
    const id = await call.end();
    if (id) router.push(`/history/${id}?recap=1`);
  };

  const partnerState = !live
    ? status === "connecting"
      ? call.phase || "Calling…"
      : status === "ending"
        ? "Hanging up…"
        : ""
    : state.partnerSpeaking
      ? "Speaking"
      : state.learnerSpeaking
        ? "Listening to you"
        : state.responseActive
          ? "Thinking…"
          : "Listening";

  const modeText =
    state.languageMode === "target"
      ? `${resolved.target.flag} Speaking ${resolved.target.name}`
      : state.languageMode === "support"
        ? `${resolved.support.flag} Helping in ${resolved.support.name}`
        : `${resolved.target.flag}${resolved.support.flag} Mixing languages`;

  if (status === "idle" || (status === "error" && !state.connectedAt)) {
    return (
      <div className="mx-auto max-w-xl px-5 py-12">
        <div className="overflow-hidden rounded-3xl bg-call text-white shadow-xl">
          <div className="flex flex-col items-center gap-4 px-8 pt-10 pb-8 text-center">
            <PersonaPortrait portrait={p.portrait} size={160} title={name} />
            <div>
              <h1 className="text-2xl font-semibold">{name}</h1>
              <p className="text-white/70">
                {p.occupation} · {p.city}
              </p>
            </div>
            <p className="text-sm text-white/80">
              {resolved.scenario.emoji} {resolved.scenario.title} · {resolved.level.label} · {resolved.target.name}
            </p>
            <button
              type="button"
              onClick={call.start}
              className="mt-2 rounded-full bg-accent px-8 py-3.5 text-lg font-semibold transition-colors hover:bg-teal-600"
            >
              Start call
            </button>
            {call.error && (
              <p role="alert" className="max-w-md text-sm text-orange-200">
                {call.error}
              </p>
            )}
          </div>
          <ul className="space-y-1.5 bg-call2 px-8 py-6 text-sm text-white/80">
            <li>Just talk. {name} answers as soon as you finish, and you can cut in any time.</li>
            <li>
              Stuck? Say &ldquo;{resolved.support.name}, please&rdquo; or tap <em>Explain in {resolved.support.name}</em>.
            </li>
            <li>Mistakes are welcome. Corrections show up next to what you said.</li>
          </ul>
        </div>
      </div>
    );
  }

  const ringScale = 1 + Math.min(0.18, levels.partner * 0.3);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:h-[calc(100dvh-57px)] lg:grid-cols-[360px_1fr]">
      <div className="flex flex-col gap-4 lg:overflow-y-auto">
        <section aria-label={`Call with ${name}`} className="rounded-3xl bg-call p-6 text-white shadow-lg">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
              {live ? "Live" : status === "error" ? "Disconnected" : "Connecting"}
            </span>
            <span className="tabular-nums">{clock}</span>
          </div>
          <div className="relative mx-auto mt-4 grid h-48 w-48 place-items-center">
            {state.partnerSpeaking && (
              <span aria-hidden className="ring-pulse absolute inset-2 rounded-full border-2 border-teal-300/60" />
            )}
            <div
              className="rounded-full p-1.5 transition-transform duration-75"
              style={{
                transform: `scale(${ringScale})`,
                boxShadow: state.partnerSpeaking ? "0 0 0 4px rgba(94,234,212,.45)" : "0 0 0 2px rgba(255,255,255,.12)",
              }}
            >
              <PersonaPortrait portrait={p.portrait} size={168} speaking={levels.partner} title={name} />
            </div>
          </div>
          <div className="mt-3 text-center">
            <div className="text-xl font-semibold">{name}</div>
            <div className="text-sm text-white/70" aria-live="polite">
              {partnerState}
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{modeText}</span>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={call.toggleMute}
              disabled={!live}
              aria-pressed={call.muted}
              className={`relative grid h-14 w-14 place-items-center rounded-full transition-colors disabled:opacity-40 ${
                call.muted ? "bg-white text-call" : "bg-white/10 hover:bg-white/20"
              }`}
              aria-label={call.muted ? "Unmute microphone" : "Mute microphone"}
            >
              <MicIcon off={call.muted} />
              {!call.muted && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2 border-emerald-300"
                  style={{ opacity: Math.min(1, levels.learner * 2) }}
                />
              )}
            </button>
            <button
              type="button"
              onClick={hangUp}
              disabled={status === "ending"}
              className="grid h-14 w-14 place-items-center rounded-full bg-red-600 transition-colors hover:bg-red-500 disabled:opacity-50"
              aria-label="End call"
            >
              <PhoneIcon />
            </button>
          </div>
          {call.error && (
            <p role="alert" className="mt-4 text-center text-sm text-orange-200">
              {call.error}
            </p>
          )}
        </section>

        <section aria-label="Help" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap gap-2">
            <HelpButton onClick={() => call.coach("explain")} disabled={!live}>
              Explain in {resolved.support.name}
            </HelpButton>
            <HelpButton onClick={() => call.coach("repeat")} disabled={!live}>
              Repeat
            </HelpButton>
            <HelpButton onClick={() => call.coach("hint")} disabled={!live}>
              Give me a hint
            </HelpButton>
            <HelpButton
              onClick={() => call.coach("slower")}
              disabled={!live || policy.slower >= 3}
              hint="Each tap slows down a little more"
            >
              Slower{policy.slower ? ` (${policy.slower})` : ""}
            </HelpButton>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <HelpButton
              onClick={() => call.coach(policy.immersionLock ? "immersion-off" : "immersion-on")}
              disabled={!live}
              pressed={policy.immersionLock}
              hint={`Stay in ${resolved.target.name}, even when you struggle`}
            >
              Only {resolved.target.name}
            </HelpButton>
            <HelpButton onClick={() => setShowGloss((v) => !v)} pressed={showGloss} disabled={!!glossError}>
              Translations
            </HelpButton>
          </div>
          {glossError && <p className="text-xs text-muted">{glossError}</p>}
        </section>

        <section aria-label="Goals" className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">
            {resolved.scenario.emoji} {resolved.scenario.title}
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {resolved.scenario.goals.map((g) => {
              const done = state.goalsDone.includes(g.id);
              return (
                <li key={g.id} className={`flex items-center gap-2 ${done ? "text-accent" : "text-muted"}`}>
                  <span
                    aria-hidden
                    className={`grid h-4 w-4 place-items-center rounded-full border text-[10px] ${
                      done ? "border-accent bg-accent text-white" : "border-line"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span className={done ? "font-medium" : ""}>{g.label}</span>
                  <span className="sr-only">{done ? "(done)" : ""}</span>
                </li>
              );
            })}
          </ul>
          {state.vocabulary.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="text-xs font-semibold text-muted">New words</h3>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {state.vocabulary.map((v) => (
                  <li
                    key={v.term}
                    dir="auto"
                    title={v.example}
                    className="rounded-md bg-surface2 px-2 py-1 text-xs"
                  >
                    <span className="font-medium">{v.term}</span> · {v.translation}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section
        aria-label="Transcript"
        className="min-h-[50vh] rounded-3xl border border-line bg-surface2/60 p-5 lg:overflow-y-auto"
      >
        {call.warning && (
          <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-warmsoft px-3 py-2 text-sm">
            <span>{call.warning}</span>
            <button type="button" onClick={call.dismissWarning} className="text-warm" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {state.turns.length === 0 ? (
          <p className="pt-10 text-center text-muted">{live ? `${name} is picking up…` : "Connecting…"}</p>
        ) : (
          <Transcript
            turns={state.turns}
            corrections={indexCorrections(state.turns, state.corrections)}
            notices={indexNotices(state.turns, state.notices)}
            persona={p}
            showGloss={showGloss}
            follow
            learnerLabel={resolved.learnerName ?? "You"}
          />
        )}
      </section>
    </div>
  );
}

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
      {off && <path d="M4 4l16 16" strokeLinecap="round" />}
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 9c-3.2 0-6.1.9-8.4 2.4-.6.4-.8 1.2-.4 1.8l1.3 2c.4.6 1.1.8 1.7.5l2.4-1.2c.5-.3.8-.8.8-1.4v-1.4c1.7-.5 3.5-.5 5.2 0v1.4c0 .6.3 1.1.8 1.4l2.4 1.2c.6.3 1.3.1 1.7-.5l1.3-2c.4-.6.2-1.4-.4-1.8C18.1 9.9 15.2 9 12 9z" />
    </svg>
  );
}
