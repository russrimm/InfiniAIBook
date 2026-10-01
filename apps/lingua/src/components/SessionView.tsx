"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { isLanguage, language } from "@/lib/languages";
import { persona as findPersona, shortName } from "@/lib/personas";
import { scenario as findScenario } from "@/lib/scenarios";
import { setupToParams, type Setup } from "@/lib/setup";
import type { Recap, SessionDetail } from "@/lib/types";
import { Transcript } from "./Transcript";
import { PersonaPortrait } from "./PersonaPortrait";

function RecapPanel({ recap }: { recap: Recap }) {
  return (
    <div className="space-y-6">
      <p dir="auto" className="text-lg leading-relaxed text-pretty">
        {recap.summary}
      </p>

      <div className="flex flex-wrap gap-3 text-sm">
        {recap.estimatedLevel && (
          <span className="rounded-full bg-accentsoft px-3 py-1 font-medium text-accent">
            Sounded like {recap.estimatedLevel} today
          </span>
        )}
        {recap.targetLanguageShare !== undefined && (
          <span className="rounded-full bg-surface2 px-3 py-1">
            {recap.targetLanguageShare}% of your words in the target language
          </span>
        )}
      </div>

      {recap.strengths.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">What went well</h3>
          <ul className="list-disc space-y-1 pl-5" dir="auto">
            {recap.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {recap.mistakes.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Worth fixing</h3>
          <ul className="space-y-2">
            {recap.mistakes.map((m, i) => (
              <li key={i} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span dir="auto" className="text-ink/60 line-through decoration-warm/60">
                    {m.said}
                  </span>
                  <span aria-hidden className="text-warm">
                    →
                  </span>
                  <span dir="auto" className="font-medium">
                    {m.better}
                  </span>
                </div>
                <p dir="auto" className="mt-1 text-sm text-muted">
                  {m.why}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recap.vocabulary.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Words to keep</h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {recap.vocabulary.map((v, i) => (
              <div key={i} className="rounded-xl bg-surface2 px-3 py-2">
                <dt dir="auto" className="font-medium">
                  {v.term}
                </dt>
                <dd dir="auto" className="text-sm text-muted">
                  {v.meaning}
                  {v.example && <span className="mt-0.5 block italic">{v.example}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {recap.nextSteps.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Next time</h3>
          <ul className="list-disc space-y-1 pl-5" dir="auto">
            {recap.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function SessionView({ session, autoRecap }: { session: SessionDetail; autoRecap: boolean }) {
  const [recap, setRecap] = useState<Recap | null>(session.recap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGloss, setShowGloss] = useState(true);
  const started = useRef(false);

  const p = findPersona(session.persona);
  const sc = findScenario(session.scenario);
  const target = isLanguage(session.target) ? language(session.target) : null;
  const t = session.transcript;
  const learnerSpoke = t.turns.some((x) => x.role === "learner");

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/recap`, { method: "POST" });
      const data = (await res.json()) as { recap?: Recap; error?: string };
      if (!res.ok || !data.recap) throw new Error(data.error ?? "Could not write the recap.");
      setRecap(data.recap);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [session.id]);

  useEffect(() => {
    if (autoRecap && !recap && learnerSpoke && !started.current) {
      started.current = true;
      generate();
    }
  }, [autoRecap, recap, learnerSpoke, generate]);

  const again: Setup = {
    target: session.target,
    support: session.support,
    level: session.level as Setup["level"],
    scenario: session.scenario,
    persona: session.persona,
    learnerName: session.learnerName ?? undefined,
  };
  const suggested = recap?.suggestedScenario && findScenario(recap.suggestedScenario);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          {p && <PersonaPortrait portrait={p.portrait} size={64} title={shortName(p)} />}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {target?.flag} {sc?.title ?? session.scenario}
            </h1>
            <p className="text-muted">
              with {p ? shortName(p) : "your partner"} · {session.level} ·{" "}
              {Math.max(1, Math.round(session.durationSec / 60))} min
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/talk?${setupToParams(again)}`}
            className="rounded-full bg-accent px-5 py-2.5 font-medium text-white hover:bg-teal-600"
          >
            Practice again
          </Link>
          {suggested && suggested.id !== session.scenario && (
            <Link
              href={`/talk?${setupToParams({ ...again, scenario: suggested.id })}`}
              className="rounded-full border border-line bg-surface px-5 py-2.5 font-medium hover:border-ink/30"
            >
              Try next: {suggested.emoji} {suggested.title}
            </Link>
          )}
        </div>

        <section aria-label="Recap" className="rounded-3xl border border-line bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recap</h2>
            {recap && (
              <button type="button" onClick={generate} disabled={busy} className="text-sm text-muted hover:text-ink">
                {busy ? "Rewriting…" : "Rewrite"}
              </button>
            )}
          </div>
          {recap ? (
            <RecapPanel recap={recap} />
          ) : busy ? (
            <p className="text-muted" aria-live="polite">
              Writing your recap…
            </p>
          ) : learnerSpoke ? (
            <button
              type="button"
              onClick={generate}
              className="rounded-full border border-line px-4 py-2 font-medium hover:border-ink/30"
            >
              Write a recap
            </button>
          ) : (
            <p className="text-muted">You didn&apos;t say anything in this call, so there&apos;s nothing to recap.</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-warm">
              {error}
            </p>
          )}
        </section>
      </div>

      <section aria-label="Transcript" className="rounded-3xl border border-line bg-surface2/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Transcript</h2>
          {t.turns.some((x) => x.gloss) && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={showGloss} onChange={(e) => setShowGloss(e.target.checked)} />
              Translations
            </label>
          )}
        </div>
        {p && t.turns.length ? (
          <Transcript
            turns={t.turns}
            corrections={t.corrections}
            persona={p}
            showGloss={showGloss}
            learnerLabel={session.learnerName ?? "You"}
          />
        ) : (
          <p className="text-muted">No transcript was saved for this call.</p>
        )}
      </section>
    </div>
  );
}
