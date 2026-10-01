"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES, language } from "@/lib/languages";
import { LEVELS, LEVEL_IDS, type LevelId } from "@/lib/levels";
import { personasFor, shortName } from "@/lib/personas";
import { SCENARIOS } from "@/lib/scenarios";
import { SetupSchema, setupToParams } from "@/lib/setup";
import { PersonaPortrait } from "./PersonaPortrait";

type Status = { ready: boolean; problems: string[]; chat: string | null; transcription: string | null };

const STORAGE_KEY = "lingua:setup";

type Prefs = { target: string; support: string; level: LevelId; scenario: string; persona?: string; name: string };

const DEFAULTS: Prefs = { target: "es", support: "en", level: "A2", scenario: "free", name: "" };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...p };
  } catch {
    return DEFAULTS;
  }
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-baseline gap-3 text-base font-semibold">
        <span className="text-sm font-medium text-muted tabular-nums">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SetupForm() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [status, setStatus] = useState<Status | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const update = (patch: Partial<Prefs>) => {
    setFormError(null);
    setPrefs((p) => {
      const next = { ...p, ...patch };
      // Keep target and support apart: swapping is the most likely intent.
      if (patch.target && patch.target === p.support) next.support = p.target;
      if (patch.support && patch.support === p.target) next.target = p.support;
      if (next.target !== p.target) next.persona = undefined;
      return next;
    });
  };

  const partners = useMemo(() => personasFor(prefs.target), [prefs.target]);
  const persona = partners.find((p) => p.id === prefs.persona) ?? partners[0];

  const start = () => {
    const parsed = SetupSchema.safeParse({
      target: prefs.target,
      support: prefs.support,
      level: prefs.level,
      scenario: prefs.scenario,
      persona: persona?.id,
      learnerName: prefs.name.trim() || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check your choices.");
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, persona: persona?.id }));
    router.push(`/talk?${setupToParams(parsed.data)}`);
  };

  const target = language(prefs.target);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1fr_340px]">
      <div className="space-y-9">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Have a real conversation in {target.name}.
          </h1>
          <p className="max-w-2xl text-muted text-pretty">
            Talk out loud with a partner who answers right away, lets you interrupt, and switches to your
            language when you get stuck. Ask for help any time, by voice or with a button.
          </p>
        </div>

        {status && !status.ready && (
          <div role="alert" className="rounded-xl border border-warm/30 bg-warmsoft p-4 text-sm">
            <p className="font-medium text-warm">Lingua isn&apos;t connected to a voice model yet.</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink/80">
              {status.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        <Section step={1} title="Languages">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-muted">I want to practice</span>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base"
                value={prefs.target}
                onChange={(e) => update({ target: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.name} · {l.native}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted">Help me in</span>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base"
                value={prefs.support}
                onChange={(e) => update({ support: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.name} · {l.native}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Section>

        <Section step={2} title="Your level">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LEVEL_IDS.map((id) => {
              const lv = LEVELS[id];
              const on = prefs.level === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ level: id })}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    on ? "border-accent bg-accentsoft" : "border-line bg-surface hover:border-ink/30"
                  }`}
                >
                  <div className="text-sm font-semibold">{lv.label}</div>
                  <div className="mt-0.5 text-xs text-muted">{lv.summary}</div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section step={3} title="Situation">
          <div className="grid gap-2 sm:grid-cols-2">
            {SCENARIOS.map((sc) => {
              const on = prefs.scenario === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ scenario: sc.id })}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    on ? "border-accent bg-accentsoft" : "border-line bg-surface hover:border-ink/30"
                  }`}
                >
                  <span aria-hidden className="text-xl leading-none">
                    {sc.emoji}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{sc.title}</span>
                    <span className="block text-xs text-muted">{sc.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section step={4} title="Your partner">
          <div className="grid gap-3 sm:grid-cols-2">
            {partners.map((p) => {
              const on = persona?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ persona: p.id })}
                  className={`flex items-center gap-4 rounded-xl border p-3 text-left transition-colors ${
                    on ? "border-accent bg-accentsoft" : "border-line bg-surface hover:border-ink/30"
                  }`}
                >
                  <PersonaPortrait portrait={p.portrait} size={64} title={shortName(p)} />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {shortName(p)}, {p.age}
                    </span>
                    <span className="block text-xs text-muted">
                      {p.occupation} · {p.city}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <label className="block max-w-sm space-y-1.5 pt-2 text-sm">
            <span className="text-muted">What should they call you? (optional)</span>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base"
              value={prefs.name}
              maxLength={40}
              autoComplete="given-name"
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Your first name"
            />
          </label>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        {persona && (
          <div className="overflow-hidden rounded-2xl bg-call text-white shadow-lg">
            <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-6">
              <PersonaPortrait portrait={persona.portrait} size={132} title={shortName(persona)} />
              <div className="text-center">
                <div className="text-lg font-semibold">{shortName(persona)}</div>
                <div className="text-sm text-white/70">{persona.city}</div>
              </div>
              <p className="text-center text-sm text-white/80 text-pretty">
                Loves {persona.interests.slice(0, 3).join(", ")}.
              </p>
            </div>
            <div className="space-y-3 bg-call2 px-6 py-5">
              <div className="text-xs text-white/60">
                {LEVELS[prefs.level].label} · {SCENARIOS.find((s) => s.id === prefs.scenario)?.title}
              </div>
              <button
                type="button"
                onClick={start}
                className="w-full rounded-full bg-accent py-3 font-semibold text-white transition-colors hover:bg-teal-600"
              >
                Call {shortName(persona)}
              </button>
              {formError && (
                <p role="alert" className="text-sm text-orange-200">
                  {formError}
                </p>
              )}
              <p className="text-xs text-white/60">
                Uses your microphone. Headphones help your partner hear you, not themselves.
              </p>
            </div>
          </div>
        )}
        {status?.ready && !status.chat && (
          <p className="mt-3 text-xs text-muted">
            Translations and recaps are off until a chat model is configured (AZURE_OPENAI_DEPLOYMENT).
          </p>
        )}
      </aside>
    </div>
  );
}
