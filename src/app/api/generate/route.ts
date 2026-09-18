import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatJSON, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES, STUDIO } from "@/lib/studio";
import type { ArtifactType } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACCENTS = ["indigo", "emerald", "amber", "rose", "sky", "violet"];

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
      return {
        title: str(raw.title, "Infographic"),
        subtitle: str(raw.subtitle),
        accent,
        stats,
        sections,
        takeaway: str(raw.takeaway),
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
  if (type === "infographic") return (c.sections as unknown[]).length === 0;
  if (type === "mindmap") return ((c.root as Loose).children as unknown[]).length === 0;
  return !str(c.markdown).trim();
}

export async function POST(req: Request) {
  try {
    const { notebookId, type, topic, sourceIds } = (await req.json()) as {
      notebookId: string;
      type: ArtifactType;
      topic?: string;
      sourceIds?: string[];
    };

    const spec = STUDIO[type];
    if (!spec) return NextResponse.json({ error: "Unknown artifact type" }, { status: 400 });

    let passages: Passage[];
    if (topic?.trim()) {
      const focused = await retrieve(notebookId, topic, sourceIds, 24);
      const broad = sampleCorpus(notebookId, sourceIds, 24000);
      const seen = new Set(focused.map((p) => p.id));
      passages = [...focused, ...broad.filter((p) => !seen.has(p.id))].slice(0, 45);
    } else {
      passages = sampleCorpus(notebookId, sourceIds, 60000);
    }

    if (!passages.length) {
      return NextResponse.json(
        { error: "Add at least one source before generating." },
        { status: 400 }
      );
    }

    const citations = citationList(passages);
    const messages: ChatMsg[] = [
      { role: "system", content: `${GROUNDING_RULES}\n\n${spec.instruction(topic?.trim() ?? "")}` },
      {
        role: "user",
        content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
      },
    ];

    const raw = await chatJSON<Loose>(messages, 0.5);
    const content = normalize(type, raw);
    if (isEmpty(type, content)) {
      return NextResponse.json(
        { error: "The model returned an empty result. Try again or narrow the focus." },
        { status: 502 }
      );
    }

    const id = nanoid(12);
    const title = str(content.title, spec.label);
    const stored = { ...content, citations };
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, type, title, JSON.stringify(stored), Date.now());

    return ok({ id, type, title, content: stored, createdAt: Date.now() });
  } catch (e) {
    return fail(e);
  }
}
