import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatJSON, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES, STUDIO } from "@/lib/studio";
import { styleDef } from "@/lib/infographic";
import type { ArtifactType } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACCENTS = ["indigo", "emerald", "amber", "rose", "sky", "violet"];

/**
 * Characters of source material sent to the model. Roughly 4 chars per token,
 * so the default lands near 7.5K prompt tokens — comfortably inside a modest
 * per-minute deployment quota while still spanning the whole corpus.
 */
const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);
const MIN_CONTEXT_CHARS = 6000;

type Loose = Record<string, unknown>;
const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function normalize(type: ArtifactType, raw: Loose): Loose {
  switch (type) {
    case "quiz": {
      const questions = arr(raw.questions)
        .map((q) => {
          const o = q as Loose;
          const choices = arr(o.choices).map((c) => str(c)).filter(Boolean);
          if (!str(o.question) || choices.length < 2) return null;
          let idx = Number(o.answerIndex);
          if (!Number.isInteger(idx) || idx < 0 || idx >= choices.length) idx = 0;
          return {
            question: str(o.question),
            choices,
            answerIndex: idx,
            explanation: str(o.explanation),
          };
        })
        .filter(Boolean);
      return { title: str(raw.title, "Quiz"), questions };
    }
    case "mindmap": {
      const walk = (n: unknown, depth: number): Loose | null => {
        const o = (n ?? {}) as Loose;
        const label = str(o.label).trim();
        if (!label) return null;
        const children =
          depth >= 3
            ? []
            : arr(o.children)
                .map((c) => walk(c, depth + 1))
                .filter(Boolean);
        return { label, note: str(o.note) || undefined, children };
      };
      const root = walk(raw.root, 0) ?? { label: str(raw.title, "Overview"), children: [] };
      return { title: str(raw.title, "Mind map"), root };
    }
    case "faq": {
      const items = arr(raw.items)
        .map((i) => {
          const o = i as Loose;
          return str(o.q) && str(o.a) ? { q: str(o.q), a: str(o.a) } : null;
        })
        .filter(Boolean);
      return { title: str(raw.title, "FAQ"), items };
    }
    case "timeline": {
      const items = arr(raw.items)
        .map((i) => {
          const o = i as Loose;
          return str(o.title)
            ? { date: str(o.date, "—"), title: str(o.title), text: str(o.text) }
            : null;
        })
        .filter(Boolean);
      return { title: str(raw.title, "Timeline"), items };
    }
    case "infographic": {
      const accent = ACCENTS.includes(str(raw.accent)) ? str(raw.accent) : "indigo";
      const stats = arr(raw.stats)
        .map((s) => {
          const o = s as Loose;
          return str(o.value)
            ? { value: str(o.value), label: str(o.label), caption: str(o.caption) }
            : null;
        })
        .filter(Boolean)
        .slice(0, 4);
      const sections = arr(raw.sections)
        .map((s) => {
          const o = s as Loose;
          const bullets = arr(o.bullets).map((b) => str(b)).filter(Boolean);
          return str(o.heading) && bullets.length
            ? { heading: str(o.heading), icon: str(o.icon, "•"), bullets }
            : null;
        })
        .filter(Boolean);
      const list = (v: unknown, max: number) =>
        arr(v)
          .map((x) => str(x))
          .filter(Boolean)
          .slice(0, max);

      const chart = arr(raw.chart)
        .map((c) => {
          const o = c as Loose;
          const value = Number(o.value);
          if (!str(o.label) || !Number.isFinite(value) || value < 0) return null;
          // A sentence here wrecks the bar layout, so keep only a compact figure.
          const display = str(o.display).trim();
          return {
            label: str(o.label).slice(0, 32),
            value,
            display: display && display.length <= 12 ? display : undefined,
          };
        })
        .filter(Boolean)
        .slice(0, 6) as { label: string; value: number; display?: string }[];

      const rawCompare = (raw.compare ?? {}) as Loose;
      const rows = arr(rawCompare.rows)
        .map((r) => {
          const o = r as Loose;
          return str(o.feature)
            ? { feature: str(o.feature), a: str(o.a), b: str(o.b) }
            : null;
        })
        .filter(Boolean)
        .slice(0, 6) as { feature: string; a: string; b: string }[];
      const compare =
        rows.length && str(rawCompare.aLabel) && str(rawCompare.bLabel)
          ? {
              aLabel: str(rawCompare.aLabel),
              bLabel: str(rawCompare.bLabel),
              rows,
              verdict: str(rawCompare.verdict) || undefined,
            }
          : undefined;

      const checklist = arr(raw.checklist)
        .map((c) => {
          const o = c as Loose;
          return str(o.title)
            ? { title: str(o.title), detail: str(o.detail) }
            : null;
        })
        .filter(Boolean)
        .slice(0, 10) as { title: string; detail: string }[];

      // The header sits on a themed, often accent-coloured band, where a
      // citation pill is either invisible or stray text depending on the
      // style. Headings frame the piece; the claims they preview are cited
      // again in the body, so strip markers from both.
      const stripMarkers = (s: string) =>
        s.replace(/\s*\[\d+\](?:\[\d+\])*/g, "").trim();

      return {
        title: stripMarkers(str(raw.title, "Infographic")),
        subtitle: stripMarkers(str(raw.subtitle)),
        accent,
        stats,
        sections,
        takeaway: str(raw.takeaway),
        pullQuote: str(raw.pullQuote) || undefined,
        nextSteps: list(raw.nextSteps, 4).length ? list(raw.nextSteps, 4) : undefined,
        flow: list(raw.flow, 6).length ? list(raw.flow, 6) : undefined,
        chart: chart.length >= 2 ? chart : undefined,
        compare,
        checklist: checklist.length ? checklist : undefined,
      };
    }
    default: {
      return {
        title: str(raw.title, STUDIO[type].label),
        subtitle: str(raw.subtitle),
        markdown: str(raw.markdown) || str(raw.content) || "_No content returned._",
      };
    }
  }
}

function isEmpty(type: ArtifactType, c: Loose): boolean {
  if (type === "quiz") return (c.questions as unknown[]).length === 0;
  if (type === "faq") return (c.items as unknown[]).length === 0;
  if (type === "timeline") return (c.items as unknown[]).length === 0;
  if (type === "infographic") {
    // Checklist and comparison styles legitimately carry little or no
    // "sections", so the body can live in any of these.
    return (
      (c.sections as unknown[]).length === 0 &&
      !c.compare &&
      !(c.checklist as unknown[] | undefined)?.length &&
      !(c.chart as unknown[] | undefined)?.length
    );
  }
  if (type === "mindmap") return ((c.root as Loose).children as unknown[]).length === 0;
  return !str(c.markdown).trim();
}

export async function POST(req: Request) {
  try {
    const { notebookId, type, topic, sourceIds, style } = (await req.json()) as {
      notebookId: string;
      type: ArtifactType;
      topic?: string;
      sourceIds?: string[];
      style?: string;
    };

    const spec = STUDIO[type];
    if (!spec) return NextResponse.json({ error: "Unknown artifact type" }, { status: 400 });

    // Infographic styles change the content shape, not just the palette.
    const styleHint =
      type === "infographic" && style
        ? `\n\nSTYLE: ${styleDef(style).label}\n${styleDef(style).hint}`.trimEnd()
        : "";

    const collect = (budget: number): Passage[] => {
      if (topic?.trim()) {
        const broad = sampleCorpus(notebookId, sourceIds, Math.round(budget * 0.4));
        const seen = new Set(focusedPassages.map((p) => p.id));
        return [...focusedPassages, ...broad.filter((p) => !seen.has(p.id))].slice(0, 45);
      }
      return sampleCorpus(notebookId, sourceIds, budget);
    };

    const focusedPassages = topic?.trim()
      ? await retrieve(notebookId, topic, sourceIds, 24)
      : [];

    let budget = MAX_CONTEXT_CHARS;
    let passages = collect(budget);

    if (!passages.length) {
      return NextResponse.json(
        { error: "Add at least one source before generating." },
        { status: 400 }
      );
    }

    // A deployment's tokens-per-minute quota caps how much context a single
    // request may carry. Rather than fail, shrink the excerpt budget and retry
    // so generation still succeeds on small deployments.
    let raw: Loose | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      const messages: ChatMsg[] = [
        {
          role: "system",
          content: `${GROUNDING_RULES}\n\n${spec.instruction(topic?.trim() ?? "")}${styleHint}`,
        },
        {
          role: "user",
          content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
        },
      ];
      try {
        raw = await chatJSON<Loose>(messages, 0.5);
        break;
      } catch (e) {
        lastError = e;
        const status = (e as { status?: number })?.status;
        if (status !== 429 || budget <= MIN_CONTEXT_CHARS) throw e;
        budget = Math.max(MIN_CONTEXT_CHARS, Math.floor(budget / 2));
        const next = collect(budget);
        if (!next.length) throw e;
        passages = next;
        console.warn(
          `[generate] rate limited, retrying ${type} with ${budget} chars of context`
        );
      }
    }

    if (!raw) throw lastError;

    const citations = citationList(passages);
    const content = normalize(type, raw);
    if (isEmpty(type, content)) {
      return NextResponse.json(
        { error: "The model returned an empty result. Try again or narrow the focus." },
        { status: 502 }
      );
    }

    const id = nanoid(12);
    const title = str(content.title, spec.label);
    const stored = {
      ...content,
      ...(type === "infographic" ? { style: style || "classic" } : {}),
      citations,
    };
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, type, title, JSON.stringify(stored), Date.now());

    return ok({ id, type, title, content: stored, createdAt: Date.now() });
  } catch (e) {
    return fail(e);
  }
}
