"use client";

import { useState } from "react";
import { readJSONReply } from "@/lib/jsonreply";
import type { HarSummary } from "@/lib/har";
import type { Diagnosis } from "@/lib/hardiagnose";
import { MILESTONE_COLOR, PHASE_COLOR, PHASES, fmtBytes, fmtMs, statusTone } from "./ExplorerHar";

const MAX_ROWS = 500;

function niceStep(span: number, ticks: number): number {
  const raw = span / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/** All requests on one time axis, with page milestones as vertical lines. */
export function Waterfall({ har, onPick }: { har: HarSummary; onPick: (i: number) => void }) {
  const end = Math.max(1, har.totals.wallTime);
  const step = niceStep(end, 8);
  const ticks: number[] = [];
  for (let t = 0; t <= end; t += step) ticks.push(t);
  const rows = har.requests.slice(0, MAX_ROWS);
  const pct = (ms: number) => `${Math.min(100, (ms / end) * 100)}%`;
  const marks = har.pages.flatMap((p) => [
    ...(p.onContentLoad !== null ? [{ at: p.offset + p.onContentLoad, label: "DOMContentLoaded", color: MILESTONE_COLOR.dom }] : []),
    ...(p.onLoad !== null ? [{ at: p.offset + p.onLoad, label: "Load", color: MILESTONE_COLOR.load }] : []),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
        {PHASES.map((k) => (
          <li key={k} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[k] }} />
            {k}
          </li>
        ))}
        {marks.length > 0 && (
          <>
            <li className="flex items-center gap-1">
              <span className="h-2.5 w-0.5" style={{ background: MILESTONE_COLOR.dom }} />
              DOMContentLoaded
            </li>
            <li className="flex items-center gap-1">
              <span className="h-2.5 w-0.5" style={{ background: MILESTONE_COLOR.load }} />
              Load
            </li>
          </>
        )}
      </ul>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--border)]">
        <div className="min-w-[44rem]">
          <div className="sticky top-0 z-10 flex border-b border-[var(--border)] bg-[var(--panel)] text-[11px] text-[var(--muted)]">
            <div className="w-64 shrink-0 px-2 py-1">Request</div>
            <div className="relative h-6 flex-1">
              {ticks.map((t) => (
                <span key={t} className="absolute top-1" style={{ left: pct(t) }}>
                  {fmtMs(t)}
                </span>
              ))}
            </div>
          </div>
          {rows.map((r) => (
            <button
              key={r.index}
              className="flex w-full items-center border-b border-[var(--border)] text-left text-[11px] hover:bg-[var(--hover)]"
              onClick={() => onPick(r.index)}
              title={`${r.method} ${r.url}`}
            >
              <span className="flex w-64 shrink-0 gap-1.5 overflow-hidden px-2 py-1">
                <span className={`shrink-0 ${statusTone(r.status)}`}>{r.status || "failed"}</span>
                <span className="truncate">
                  {r.host}
                  {r.path}
                </span>
              </span>
              <span className="relative h-4 flex-1">
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-[var(--border)]" style={{ left: pct(t) }} />
                ))}
                {marks.map((m) => (
                  <span key={m.label + m.at} className="absolute inset-y-0 w-0.5" style={{ left: pct(m.at), background: m.color }} />
                ))}
                <span className="absolute top-1 flex h-2 overflow-hidden rounded" style={{ left: pct(r.offset), width: `max(2px, ${(r.time / end) * 100}%)` }}>
                  {PHASES.map((k) => {
                    const sum = PHASES.reduce((s, p) => s + r.phases[p], 0) || 1;
                    return <span key={k} style={{ width: `${(r.phases[k] / sum) * 100}%`, background: PHASE_COLOR[k] }} />;
                  })}
                </span>
                <span className="absolute top-0 text-[10px] whitespace-nowrap text-[var(--muted)]" style={{ left: `calc(${pct(r.offset + r.time)} + 4px)` }}>
                  {fmtMs(r.time)} · {fmtBytes(r.transfer || r.size)}
                </span>
              </span>
            </button>
          ))}
          {har.requests.length > MAX_ROWS && (
            <p className="p-2 text-[11px] text-[var(--muted)]">Showing the first {MAX_ROWS} of {har.requests.length.toLocaleString()} requests.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const SEVERITY_TONE = {
  high: "bg-red-500/20 text-red-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-sky-500/20 text-sky-300",
} as const;

/** Asks the configured model what is likely wrong in the capture. */
export function Diagnose({ sourceId, onPick }: { sourceId: string; onPick: (i: number) => void }) {
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ diagnosis: Diagnosis; model: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${sourceId}/diagnose`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problem }),
      });
      setResult(await readJSONReply<{ diagnosis: Diagnosis; model: string; error?: string }>(res, "The diagnosis failed."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The diagnosis failed.");
    } finally {
      setBusy(false);
    }
  };

  const d = result?.diagnosis;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="space-y-2">
        <label htmlFor="har-problem" className="block text-[13px] font-semibold">
          What problem are you seeing? <span className="font-normal text-[var(--muted)]">(optional)</span>
        </label>
        <textarea
          id="har-problem"
          className="input min-h-20 w-full text-[13px]"
          maxLength={600}
          placeholder="For example: the checkout page hangs after I click Pay, or the dashboard loads slowly since Tuesday."
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary !px-3 !py-1.5 !text-[13px]" disabled={busy} onClick={() => void run()}>
            {busy ? "Analyzing…" : d ? "Analyze again" : "Diagnose with AI"}
          </button>
          <p className="min-w-0 flex-1 text-[11px] text-[var(--muted)]">
            Sends a summary of failing, slow and large requests to your configured AI model. Cookies, credentials, tokens,
            emails and long secrets are removed first; the archive itself never leaves the server.
          </p>
        </div>
        {error && <p role="alert" className="text-[13px] text-red-300">{error}</p>}
      </section>

      {d && (
        <>
          <section className="rounded-lg border border-line-strong bg-[#141922] p-3">
            <h3 className="mb-1 text-[13px] font-semibold">Summary</h3>
            <p className="text-[13px] leading-relaxed text-prose-soft">{d.summary}</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">AI-generated from the digest. Verify against the requests before acting. Model: {result?.model}</p>
          </section>

          {d.causes.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-[13px] font-semibold">Likely causes</h3>
              {d.causes.map((c, i) => (
                <article key={`${i}-${c.title}`} className="rounded-lg border border-[var(--border)] bg-well p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 text-[10px] uppercase ${SEVERITY_TONE[c.severity]}`}>{c.severity}</span>
                    <h4 className="text-[13px] font-semibold">{c.title}</h4>
                    <span className="ml-auto text-[11px] text-[var(--muted)]">{c.confidence} confidence</span>
                  </div>
                  {c.explanation && <p className="mt-1.5 text-[13px] text-prose-soft">{c.explanation}</p>}
                  {c.evidence && (
                    <p className="mt-1.5 text-[13px]">
                      <span className="text-[var(--muted)]">Evidence: </span>
                      {c.evidence}
                    </p>
                  )}
                  {c.fix && (
                    <p className="mt-1.5 text-[13px]">
                      <span className="text-[var(--muted)]">Fix: </span>
                      {c.fix}
                    </p>
                  )}
                  {c.requests.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1 text-[11px]">
                      {c.requests.map((n) => (
                        <button key={n} className="rounded bg-[var(--hover)] px-1.5 py-0.5 underline text-[var(--link)]" onClick={() => onPick(n - 1)}>
                          Request #{n}
                        </button>
                      ))}
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}

          {d.observations.length > 0 && (
            <section>
              <h3 className="mb-1 text-[13px] font-semibold">Other observations</h3>
              <ul className="list-disc space-y-1 pl-4 text-[13px] text-prose-soft">
                {d.observations.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
          )}
          {d.questions.length > 0 && (
            <section>
              <h3 className="mb-1 text-[13px] font-semibold">To confirm</h3>
              <ul className="list-disc space-y-1 pl-4 text-[13px] text-prose-soft">
                {d.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
