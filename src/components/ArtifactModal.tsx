"use client";

import { useEffect, useState } from "react";
import Markdown, { InlineCited } from "./Markdown";
import MindMap from "./MindMap";
import Quiz from "./Quiz";
import Infographic from "./Infographic";
import PodcastPlayer from "./PodcastPlayer";
import { STUDIO } from "@/lib/studio";
import type {
  Artifact,
  ArtifactType,
  Citation,
  DocContent,
  FaqContent,
  InfographicContent,
  MindMapContent,
  MindNode,
  PodcastContent,
  QuizContent,
  TimelineContent,
} from "@/lib/types";

function mindToMd(n: MindNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  const note = n.note ? ` — ${n.note}` : "";
  return [
    `${pad}- **${n.label}**${note}`,
    ...(n.children ?? []).map((c) => mindToMd(c, depth + 1)),
  ].join("\n");
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
        .map((t) => `**${t.speaker === "a" ? p.voices.a : p.voices.b}:** ${t.text}`)
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
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const citations = (artifact.content as { citations?: Citation[] }).citations ?? [];
  const spec = STUDIO[artifact.type as ArtifactType];

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const download = () => {
    const blob = new Blob([toMarkdown(artifact)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${artifact.title.replace(/[^\w\s-]/g, "").slice(0, 60) || "artifact"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
        className="fade-up flex h-full w-full max-w-4xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl"
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
          <button className="btn !px-2.5 !py-1.5 !text-xs" onClick={download}>
            Export
          </button>
          <button
            aria-label="Close"
            className="btn !px-2.5 !py-1.5 !text-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <Body artifact={artifact} citations={citations} />
        </div>

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

function Body({ artifact, citations }: { artifact: Artifact; citations: Citation[] }) {
  const c = artifact.content as unknown;
  switch (artifact.type) {
    case "quiz":
      return <Quiz content={c as QuizContent} citations={citations} />;
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
