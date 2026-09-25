"use client";

import { useEffect, useRef, useState } from "react";
import Markdown, { InlineCited } from "./Markdown";
import MindMap from "./MindMap";
import Quiz from "./Quiz";
import Flashcards from "./Flashcards";
import Infographic from "./Infographic";
import PodcastPlayer from "./PodcastPlayer";
import VideoPlayer from "./VideoPlayer";
import { STUDIO } from "@/lib/studio";
import type {
  Artifact,
  ArtifactType,
  Citation,
  DocContent,
  FaqContent,
  FlashcardsContent,
  InfographicContent,
  MindMapContent,
  MindNode,
  PodcastContent,
  PodcastSpeakerId,
  QuizContent,
  TimelineContent,
  VideoContent,
} from "@/lib/types";

/** Citation markers are internal navigation; they are noise in an export. */
const stripCitations = (s: string) =>
  s.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "").replace(/\s+/g, " ").trim();

function mindToMd(n: MindNode, depth = 0): string {  const pad = "  ".repeat(depth);
  const note = n.note ? ` — ${n.note}` : "";
  return [
    `${pad}- **${n.label}**${note}`,
    ...(n.children ?? []).map((c) => mindToMd(c, depth + 1)),
  ].join("\n");
}

function podcastSpeakerLabel(p: PodcastContent, id: PodcastSpeakerId): string {
  const profile = p.speakers?.find((s) => s.id === id);
  return profile?.name?.trim() || p.voices[id] || id.toUpperCase();
}

function toMarkdown(a: Artifact): string {
  const c = a.content as Record<string, unknown>;
  const head = `# ${a.title}\n\n`;
  switch (a.type) {
    case "quiz": {
      const q = c as unknown as QuizContent;
      const body = q.questions
        .map(
          (x, i) =>
            `**${i + 1}. ${x.question}**\n\n${x.choices
              .map((ch, ci) => `${String.fromCharCode(65 + ci)}. ${ch}`)
              .join("\n")}\n`
        )
        .join("\n");
      const key = q.questions
        .map(
          (x, i) =>
            `${i + 1}. ${String.fromCharCode(65 + x.answerIndex)} — ${x.explanation}`
        )
        .join("\n");
      return `${head}${body}\n---\n\n## Answer key\n\n${key}\n`;
    }
    case "faq": {
      const f = c as unknown as FaqContent;
      return head + f.items.map((i) => `### ${i.q}\n\n${i.a}\n`).join("\n");
    }
    case "flashcards": {
      const d = c as unknown as FlashcardsContent;
      // Two columns so the export can be imported by Anki, Quizlet and the
      // other tools that expect a delimited front/back pair.
      const rows = d.cards
        .map((x) => `| ${x.front.replace(/\|/g, "\\|")} | ${x.back.replace(/\|/g, "\\|")} |`)
        .join("\n");
      return `${head}${d.subtitle ? `${d.subtitle}\n\n` : ""}| Front | Back |\n|---|---|\n${rows}\n`;
    }
    case "timeline": {
      const t = c as unknown as TimelineContent;
      return head + t.items.map((i) => `**${i.date} — ${i.title}**\n\n${i.text}\n`).join("\n");
    }
    case "mindmap": {
      const m = c as unknown as MindMapContent;
      return head + mindToMd(m.root);
    }
    case "infographic": {
      const g = c as unknown as InfographicContent;
      const parts = [head];
      if (g.subtitle) parts.push(`${g.subtitle}\n`);
      if (g.flow?.length) parts.push(`${g.flow.join(" → ")}\n`);
      if (g.chart?.length) {
        parts.push(
          `## By the numbers\n\n${g.chart
            .map((d) => `- ${d.label}: **${d.display ?? d.value}**`)
            .join("\n")}\n`
        );
      }
      if (g.compare) {
        parts.push(
          `## ${g.compare.aLabel} vs ${g.compare.bLabel}\n\n` +
            `| | ${g.compare.aLabel} | ${g.compare.bLabel} |\n|---|---|---|\n` +
            g.compare.rows
              .map((r) => `| **${r.feature}** | ${r.a} | ${r.b} |`)
              .join("\n") +
            (g.compare.verdict ? `\n\n**Verdict:** ${g.compare.verdict}` : "") +
            "\n"
        );
      }
      if (g.checklist?.length) {
        parts.push(
          `## Checklist\n\n${g.checklist
            .map((c) => `- [ ] **${c.title}** — ${c.detail}`)
            .join("\n")}\n`
        );
      }
      if (g.stats.length) {
        parts.push(
          `## Key numbers\n\n${g.stats
            .map((s) => `- **${s.value}** ${s.label}${s.caption ? ` — ${s.caption}` : ""}`)
            .join("\n")}\n`
        );
      }
      parts.push(
        g.sections
          .map(
            (s) =>
              `### ${s.icon ?? ""} ${s.heading}\n\n${s.bullets.map((b) => `- ${b}`).join("\n")}`
          )
          .join("\n\n")
      );
      if (g.pullQuote) parts.push(`\n> “${g.pullQuote}”\n`);
      if (g.nextSteps?.length) {
        parts.push(
          `\n## Next steps\n\n${g.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
        );
      }
      if (g.takeaway) parts.push(`\n**Key takeaway:** ${g.takeaway}\n`);
      return parts.join("\n");
    }
    case "podcast": {
      const p = c as unknown as PodcastContent;
      const body = p.turns
        .map((t) => `**${podcastSpeakerLabel(p, t.speaker)}:** ${t.text}`)
        .join("\n\n");
      return `${head}${p.description ?? ""}\n\n${body}\n`;
    }
    default:
      return head + ((c as unknown as DocContent).markdown ?? "");
  }
}

export default function ArtifactModal({
  artifact,
  onClose,
  onRefresh,
}: {
  artifact: Artifact;
  onClose: () => void;
  /** Re-reads the artifact so a background build can show its progress. */
  onRefresh?: () => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const citations = (artifact.content as { citations?: Citation[] }).citations ?? [];
  const spec = STUDIO[artifact.type as ArtifactType];

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const safeName = (ext: string) =>
    `${artifact.title.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "artifact"}.${ext}`;

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const download = () => saveBlob(
    new Blob([toMarkdown(artifact)], { type: "text/markdown" }),
    safeName("md")
  );

  /** Flashcard decks are most useful where they can be imported. */
  const downloadCsv = () => {
    const d = artifact.content as unknown as FlashcardsContent;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [
      "Front,Back",
      ...d.cards.map((c) => `${esc(stripCitations(c.front))},${esc(stripCitations(c.back))}`),
    ].join("\r\n");
    // A BOM keeps Excel from mangling accented characters on open.
    saveBlob(new Blob([`\ufeff${rows}`], { type: "text/csv;charset=utf-8" }), safeName("csv"));
  };

  /**
   * Rasterise what is on screen. The generated-image style already has a PNG
   * on the server, so that one is fetched rather than re-rendered — screen
   * capture would resample it through the viewport width.
   */
  const downloadPng = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const direct = (artifact.content as { imageUrl?: string }).imageUrl;
      if (direct) {
        const res = await fetch(direct);
        if (!res.ok) throw new Error("The generated image could not be fetched.");
        saveBlob(await res.blob(), safeName("png"));
        return;
      }

      const node = bodyRef.current?.firstElementChild as HTMLElement | null;
      if (!node) throw new Error("Nothing to export.");

      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        // Transparent areas pick up whatever sits behind them in a viewer, so
        // the panel colour is painted in explicitly.
        backgroundColor: getComputedStyle(node).backgroundColor || "#0e1116",
        // Web fonts are already loaded in the document; re-inlining them costs
        // seconds and occasionally fails on cross-origin CSS.
        skipFonts: true,
      });
      const blob = await (await fetch(dataUrl)).blob();
      saveBlob(blob, safeName("png"));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Could not export an image.");
    } finally {
      setExporting(false);
    }
  };

  const canExportPng =
    artifact.type === "infographic" || artifact.type === "mindmap";

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(artifact));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className={`fade-up flex h-full w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl ${
          // Infographics are composed as wide editorial pieces; at 4xl the
          // illustrated layout reflows into a tall column instead.
          artifact.type === "infographic" ? "max-w-6xl" : "max-w-4xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <span className="text-lg">{spec?.icon}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">{artifact.title}</h2>
            <p className="text-[11px] text-[var(--muted)]">
              {spec?.label} · {new Date(artifact.createdAt).toLocaleString()}
            </p>
          </div>
          <button className="btn !px-2.5 !py-1.5 !text-xs" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </button>
          {artifact.type === "podcast" && (
            <a
              className="btn !px-2.5 !py-1.5 !text-xs"
              href={(artifact.content as { audioUrl?: string }).audioUrl}
              download={safeName("mp3")}
            >
              MP3
            </a>
          )}
          {artifact.type === "flashcards" && (
            <button className="btn !px-2.5 !py-1.5 !text-xs" onClick={downloadCsv}>
              CSV
            </button>
          )}
          {canExportPng && (
            <button
              className="btn !px-2.5 !py-1.5 !text-xs"
              onClick={() => void downloadPng()}
              disabled={exporting}
            >
              {exporting ? "Rendering…" : "PNG"}
            </button>
          )}
          <button className="btn !px-2.5 !py-1.5 !text-xs" onClick={download}>
            {artifact.type === "flashcards" ? "MD" : "Export"}
          </button>
          <button
            aria-label="Close"
            className="btn !px-2.5 !py-1.5 !text-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <Body artifact={artifact} citations={citations} onRefresh={onRefresh} />
        </div>

        {exportError && (
          <p className="shrink-0 border-t border-red-900/50 bg-red-950/20 px-5 py-2 text-[11px] text-red-200">
            {exportError}
          </p>
        )}

        {citations.length > 0 && artifact.type !== "mindmap" && (
          <footer className="shrink-0 border-t border-[var(--border)] px-5 py-2.5 text-[11px] text-[var(--muted)]">
            Grounded in{" "}
            {new Set(citations.map((c) => c.sourceId)).size} source
            {new Set(citations.map((c) => c.sourceId)).size === 1 ? "" : "s"} ·{" "}
            {citations.length} excerpts
            {artifact.type === "podcast"
              ? " · spoken audio omits inline citation markers"
              : " · hover a citation to see the evidence"}
          </footer>
        )}
      </div>
    </div>
  );
}

function Body({
  artifact,
  citations,
  onRefresh,
}: {
  artifact: Artifact;
  citations: Citation[];
  onRefresh?: () => Promise<void> | void;
}) {
  const c = artifact.content as unknown;
  switch (artifact.type) {
    case "quiz":
      return <Quiz artifactId={artifact.id} content={c as QuizContent} citations={citations} />;
    case "flashcards":
      return (
        <Flashcards
          artifactId={artifact.id}
          content={c as FlashcardsContent}
          citations={citations}
        />
      );
    case "mindmap": {
      const m = c as MindMapContent;
      return (
        <div className="h-[calc(100vh-15rem)] min-h-[24rem]">
          <MindMap root={m.root} title={m.title} />
        </div>
      );
    }
    case "infographic":
      return <Infographic content={c as InfographicContent} citations={citations} />;
    case "podcast":
      return <PodcastPlayer content={c as PodcastContent} />;
    case "video":
      return (
        <VideoPlayer
          artifactId={artifact.id}
          content={c as VideoContent}
          onRefresh={onRefresh ?? (() => {})}
        />
      );
    case "faq": {
      const f = c as FaqContent;
      return (
        <div className="space-y-3">
          {f.items.map((it, i) => (
            <details
              key={i}
              className="group rounded-xl border border-[var(--border)] px-4 py-3"
            >
              <summary className="cursor-pointer list-none text-[15px] font-medium marker:hidden">
                <span className="mr-2 text-[var(--muted)] group-open:hidden">▸</span>
                <span className="mr-2 hidden text-[var(--muted)] group-open:inline">▾</span>
                {it.q}
              </summary>
              <p className="mt-2.5 pl-5 text-[14px] leading-relaxed text-[#c9d2dd]">
                <InlineCited text={it.a} citations={citations} />
              </p>
            </details>
          ))}
        </div>
      );
    }
    case "timeline": {
      const t = c as TimelineContent;
      return (
        <ol className="relative ml-2 space-y-6 border-l border-[var(--border)] pl-6">
          {t.items.map((it, i) => (
            <li key={i} className="relative">
              <span className="absolute top-1.5 -left-[1.9rem] h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-4 ring-[var(--panel)]" />
              <div className="text-[11px] font-semibold tracking-wide text-[var(--accent)] uppercase">
                {it.date}
              </div>
              <h3 className="mt-0.5 text-[15px] font-medium">{it.title}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[#c9d2dd]">
                <InlineCited text={it.text} citations={citations} />
              </p>
            </li>
          ))}
        </ol>
      );
    }
    default: {
      const d = c as DocContent;
      return (
        <>
          {d.subtitle && (
            <p className="mb-5 text-sm text-[var(--muted)]">{d.subtitle}</p>
          )}
          <Markdown citations={citations}>{d.markdown}</Markdown>
        </>
      );
    }
  }
}
