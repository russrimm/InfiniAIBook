"use client";

import Link from "next/link";
import { useState } from "react";
import { isLanguage, language } from "@/lib/languages";
import { persona as findPersona, shortName } from "@/lib/personas";
import { scenario as findScenario } from "@/lib/scenarios";
import type { SessionSummary } from "@/lib/types";
import { PersonaPortrait } from "./PersonaPortrait";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function duration(sec: number) {
  const m = Math.floor(sec / 60);
  return m ? `${m} min` : `${sec} s`;
}

export function HistoryList({ initial }: { initial: SessionSummary[] }) {
  const [sessions, setSessions] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string) => {
    if (!confirm("Delete this conversation and its recap?")) return;
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (res.ok) setSessions((s) => s.filter((x) => x.id !== id));
    else setError("Could not delete that conversation.");
  };

  if (!sessions.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center">
        <p className="text-muted">No conversations yet.</p>
        <Link href="/" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-white">
          Start your first call
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-warm">
          {error}
        </p>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {sessions.map((s) => {
          const p = findPersona(s.persona);
          const sc = findScenario(s.scenario);
          const target = isLanguage(s.target) ? language(s.target) : null;
          return (
            <li key={s.id} className="flex items-center gap-4 p-4">
              {p && <PersonaPortrait portrait={p.portrait} size={48} title={shortName(p)} />}
              <Link href={`/history/${s.id}`} className="min-w-0 flex-1 hover:underline">
                <div className="font-medium">
                  {target?.flag} {sc?.title ?? s.scenario} with {p ? shortName(p) : "your partner"}
                </div>
                {/* Server and browser time zones can differ; the browser's wins. */}
                <div className="text-sm text-muted" suppressHydrationWarning>
                  {dateFmt.format(s.createdAt)} · {s.level} · {duration(s.durationSec)} · {s.turnCount} lines
                  {s.hasRecap ? " · recap ready" : ""}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface2 hover:text-ink"
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
