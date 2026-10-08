"use client";

import { useEffect, useState } from "react";
import type { Analysis } from "@/lib/explore";
import { useDialog } from "./useDialog";
import ExplorerStructure from "./ExplorerStructure";
import ExplorerTable from "./ExplorerTable";
import { Overview, Requests } from "./ExplorerHar";
import { Diagnose, Waterfall } from "./ExplorerHarTools";

type Tab = "overview" | "requests" | "waterfall" | "diagnose" | "structure";

/** Discovers and shows the structure of a JSON, HAR, XML, CSV or TSV source. */
export default function DataExplorerModal({
  sourceId,
  title,
  onClose,
}: {
  sourceId: string;
  title: string;
  onClose: () => void;
}) {
  const { dialogRef, backdropProps } = useDialog(onClose);
  const [result, setResult] = useState<{ id: string; analysis?: Analysis; error?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/sources/${sourceId}/structure`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Analysis & { error?: string };
        if (!live) return;
        if (!r.ok) setResult({ id: sourceId, error: j.error || "The structure could not be read." });
        else setResult({ id: sourceId, analysis: j });
      })
      .catch(() => live && setResult({ id: sourceId, error: "The structure could not be read." }));
    return () => {
      live = false;
    };
  }, [sourceId]);

  const current = result?.id === sourceId ? result : null;
  const analysis = current?.analysis;
  const har = analysis?.format === "har" ? analysis.har : null;
  const tabs: { id: Tab; label: string }[] = har
    ? [
        { id: "overview", label: "Overview" },
        { id: "requests", label: `Requests (${har.totals.requests.toLocaleString()})` },
        { id: "waterfall", label: "Waterfall" },
        { id: "diagnose", label: "Diagnose with AI" },
        { id: "structure", label: "Structure" },
      ]
    : [];

  const pick = (i: number) => {
    setSelected(i);
    setTab("requests");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6" {...backdropProps}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="explorer-title"
        className="fade-up flex h-full w-full max-w-6xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] outline-none sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="explorer-title" className="truncate text-[15px] font-semibold">
              Structure explorer · {title}
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              {analysis
                ? analysis.format === "har"
                  ? "HTTP archive"
                  : analysis.format.toUpperCase()
                : current?.error
                  ? "Unavailable"
                  : "Reading…"}
              {analysis && "structure" in analysis
                ? ` · ${analysis.structure.totals.paths.toLocaleString()} distinct paths · ${analysis.structure.totals.values.toLocaleString()} values · ${analysis.structure.totals.maxDepth} levels deep`
                : ""}
            </p>
          </div>
          {har && (
            <a
              className="btn !px-2.5 !py-1.5 !text-xs"
              href={`/api/sources/${sourceId}/structure?download=sanitized`}
              download="sanitized.har"
              title="Download a copy with cookies, credentials and tokens removed, safe to share"
            >
              Sanitized HAR
            </a>
          )}
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </header>

        {tabs.length > 0 && (
          <div role="tablist" aria-label="Explorer sections" className="flex shrink-0 gap-1 border-b border-[var(--border)] px-4 py-1.5 text-[13px]">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`rounded-md px-3 py-1 ${tab === t.id ? "bg-[var(--selected)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!current && <p className="text-[13px] text-[var(--muted)]">Reading the structure…</p>}
          {current?.error && <p className="text-[13px] text-[var(--muted)]">{current.error}</p>}
          {har && analysis?.format === "har" && (
            <>
              {tab === "overview" && <Overview har={har} onPick={pick} />}
              {tab === "requests" && (
                <div className="h-full min-h-[24rem]">
                  <Requests sourceId={sourceId} har={har} selected={selected} onSelect={setSelected} />
                </div>
              )}
              {tab === "waterfall" && (
                <div className="h-full min-h-[24rem]">
                  <Waterfall har={har} onPick={pick} />
                </div>
              )}
              {tab === "diagnose" && <Diagnose sourceId={sourceId} onPick={pick} />}
              {tab === "structure" && (
                <div className="h-full min-h-[24rem]">
                  <ExplorerStructure nodes={analysis.structure.nodes} truncated={analysis.structure.truncated} />
                </div>
              )}
            </>
          )}
          {analysis && (analysis.format === "json" || analysis.format === "xml") && (
            <div className="h-full min-h-[24rem]">
              <ExplorerStructure nodes={analysis.structure.nodes} truncated={analysis.structure.truncated} />
            </div>
          )}
          {analysis && (analysis.format === "csv" || analysis.format === "tsv") && (
            <div className="h-full min-h-[24rem]">
              <ExplorerTable table={analysis.table} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
