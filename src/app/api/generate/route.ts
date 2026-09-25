import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatJSON, generateImage, type ChatMsg } from "@/lib/ai";
import { imageDir } from "@/lib/paths";
import { buildContext, citationList, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES, STUDIO } from "@/lib/studio";
import { DEFAULT_STYLE, buildImagePrompt, isImageStyle, styleDef } from "@/lib/infographic";
import type { ArtifactType, StudyDifficulty, StudyLength, StudyOptions } from "@/lib/types";
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

          // Models cluster the correct answer in the first position however
          // firmly the prompt asks otherwise — a generated six-question quiz
          // had the answer at A every time, which is scorable without reading
          // it. Shuffling here is deterministic where the instruction is not.
          // Positions are shuffled rather than values so duplicate choices
          // cannot mislocate the answer.
          const order = choices.map((_, i) => i);
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }

          return {
            question: str(o.question),
            choices: order.map((i) => choices[i]),
            answerIndex: order.indexOf(idx),
            explanation: str(o.explanation),
          };
        })
        .filter(Boolean);
      return { title: str(raw.title, "Quiz"), questions };
    }
    case "flashcards": {
      const seen = new Set<string>();
      const cards = arr(raw.cards)
        .map((c) => {
          const o = c as Loose;
          const front = str(o.front).trim();
          const back = str(o.back).trim();
          if (!front || !back) return null;
          // Models drift into near-duplicates on long decks; one cue should
          // appear once or the deck quietly wastes the learner's time.
          const key = front.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          if (seen.has(key)) return null;
          seen.add(key);
          return { front, back, hint: str(o.hint).trim() || undefined };
        })
        .filter(Boolean);
      return {
        title: str(raw.title, "Flashcards"),
        subtitle: str(raw.subtitle) || undefined,
        cards,
      };
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

      const regions = arr(raw.regions)
        .map((r) => {
          const o = r as Loose;
          const concepts = arr(o.concepts)
            .map((c) => {
              const k = c as Loose;
              if (!str(k.takeaway)) return null;
              const value = str(k.value).trim();
              return {
                takeaway: str(k.takeaway),
                detail: str(k.detail),
                metaphor: str(k.metaphor, "lightbulb"),
                // Rendered oversized, so a long string would dominate the card.
                value: value && value.length <= 10 ? value : undefined,
              };
            })
            .filter(Boolean)
            .slice(0, 6) as {
            takeaway: string;
            detail: string;
            metaphor: string;
            value?: string;
          }[];
          return str(o.heading) && concepts.length
            ? { heading: str(o.heading), concepts }
            : null;
        })
        .filter(Boolean)
        .slice(0, 3) as {
        heading: string;
        concepts: {
          takeaway: string;
          detail: string;
          metaphor: string;
          value?: string;
        }[];
      }[];

      // The header sits on a themed, often accent-coloured band, where a
      // citation pill is either invisible or stray text depending on the
      // style. Headings frame the piece; the claims they preview are cited
      // again in the body, so strip markers from both.
      const stripMarkers = (s: string) =>
        s.replace(/\s*\[\d+\](?:\[\d+\])*/g, "").trim();

      // Visual-guide fields: the central hub, a graded scale, and an N-way matrix.
      const rawHub = (raw.hub ?? {}) as Loose;
      const hub = str(rawHub.label)
        ? { label: stripMarkers(str(rawHub.label)), caption: str(rawHub.caption) }
        : undefined;

      const scale = arr(raw.scale)
        .map((s) => {
          const o = s as Loose;
          return str(o.tier)
            ? { tier: str(o.tier), example: str(o.example), figure: str(o.figure) }
            : null;
        })
        .filter(Boolean)
        .slice(0, 4) as { tier: string; example: string; figure: string }[];

      const rawMatrix = (raw.matrix ?? {}) as Loose;
      const columns = list(rawMatrix.columns, 4);
      const matrixRows = arr(rawMatrix.rows)
        .map((r) => {
          const o = r as Loose;
          const values = arr(o.values).map((v) => str(v));
          return str(o.feature)
            ? {
                feature: str(o.feature),
                values: columns.map((_, i) => values[i] ?? ""),
              }
            : null;
        })
        .filter(Boolean)
        .slice(0, 6) as { feature: string; values: string[] }[];
      const matrix =
        columns.length >= 2 && matrixRows.length ? { columns, rows: matrixRows } : undefined;

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
        regions: regions.length ? regions : undefined,
        hub,
        scale: scale.length >= 2 ? scale : undefined,
        matrix,
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
  if (type === "flashcards") return (c.cards as unknown[]).length === 0;
  if (type === "faq") return (c.items as unknown[]).length === 0;
  if (type === "timeline") return (c.items as unknown[]).length === 0;
  if (type === "infographic") {
    // Checklist, comparison and illustrated styles legitimately carry little
    // or no "sections", so the body can live in any of these.
    return (
      (c.sections as unknown[]).length === 0 &&
      !c.compare &&
      !(c.checklist as unknown[] | undefined)?.length &&
      !(c.chart as unknown[] | undefined)?.length &&
      !(c.regions as unknown[] | undefined)?.length
    );
  }
  if (type === "mindmap") return ((c.root as Loose).children as unknown[]).length === 0;
  return !str(c.markdown).trim();
}

export async function POST(req: Request) {
  try {
    const { notebookId, type, topic, sourceIds, style, difficulty, length } =
      (await req.json()) as {
        notebookId: string;
        type: ArtifactType;
        topic?: string;
        sourceIds?: string[];
        style?: string;
        difficulty?: StudyDifficulty;
        length?: StudyLength;
      };

    const spec = STUDIO[type];
    if (!spec) return NextResponse.json({ error: "Unknown artifact type" }, { status: 400 });

    // Reject unknown values rather than passing them into the prompt, where
    // they would silently become instructions.
    const studyOpts: StudyOptions | undefined = spec.study
      ? {
          difficulty: (["easy", "medium", "hard"] as const).includes(
            difficulty as StudyDifficulty
          )
            ? difficulty
            : "medium",
          length: (["short", "standard", "long"] as const).includes(
            length as StudyLength
          )
            ? length
            : "standard",
        }
      : undefined;

    // Infographic styles change the content shape, not just the palette.
    // Resolve once: the same key must drive both the prompt and what is
    // stored, or the artifact renders in a style it was not written for.
    const activeStyle = type === "infographic" ? style || DEFAULT_STYLE : undefined;
    const styleHint = activeStyle
      ? `\n\nSTYLE: ${styleDef(activeStyle).label}\n${styleDef(activeStyle).hint}`.trimEnd()
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
          content: `${GROUNDING_RULES}\n\n${spec.instruction(topic?.trim() ?? "", studyOpts)}${styleHint}`,
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

    // Image styles render the brief as a PNG. The brief itself is still
    // stored, so the artifact keeps its citations — an image alone cannot
    // carry them, and the text in it is not selectable.
    let image: { imageUrl: string; imageModel: string; imageSize: string } | null = null;
    if (isImageStyle(activeStyle)) {
      try {
        const { png, model, size } = await generateImage(
          buildImagePrompt(content as Parameters<typeof buildImagePrompt>[0], activeStyle)
        );
        fs.mkdirSync(imageDir(), { recursive: true });
        fs.writeFileSync(path.join(imageDir(), `${id}.png`), png);
        image = { imageUrl: `/api/image/${id}`, imageModel: model, imageSize: size };
      } catch (e) {
        // Falling back to the drawn style beats losing the generated brief.
        const why = e instanceof Error ? e.message : "The image model failed.";
        return NextResponse.json(
          {
            error: `The brief was generated but the image could not be rendered. ${why}`,
          },
          { status: 502 }
        );
      }
    }

    const stored = {
      ...content,
      ...(activeStyle ? { style: activeStyle } : {}),
      ...(studyOpts ? { difficulty: studyOpts.difficulty } : {}),
      ...(image ?? {}),
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
