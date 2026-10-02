import { NextResponse } from "next/server";
import { chatJSON } from "@/lib/ai";
import { fail, noSourcesSelected, ok } from "@/lib/http";
import { buildContext, sampleCorpus } from "@/lib/retrieve";
import {
  heuristicSuggestions,
  parseSuggestions,
  suggestionPrompt,
  type StyleSuggestion,
} from "@/lib/styleSuggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A small slice of the corpus is plenty to judge its shape. */
const CONTEXT_CHARS = 8000;
const MAX_TOPIC_CHARS = 2000;

/**
 * POST { notebookId, sourceIds?, topic? } → { suggestions: [{ style, reason }],
 * source: "model" | "heuristic" }. Falls back to a model-free guess when the
 * model is unavailable or returns nothing usable, so it always answers.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      notebookId?: unknown;
      sourceIds?: unknown;
      topic?: unknown;
    } | null;
    if (!body || typeof body.notebookId !== "string" || !body.notebookId) {
      return NextResponse.json({ error: "notebookId is required.", code: "invalid" }, { status: 400 });
    }
    const sourceIds = body.sourceIds;
    if (
      sourceIds !== undefined &&
      sourceIds !== null &&
      (!Array.isArray(sourceIds) || sourceIds.some((s) => typeof s !== "string"))
    ) {
      return NextResponse.json(
        { error: "sourceIds must be a list of source ids.", code: "invalid" },
        { status: 400 }
      );
    }
    const none = noSourcesSelected(sourceIds);
    if (none) return none;
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, MAX_TOPIC_CHARS) : "";

    const passages = sampleCorpus(
      body.notebookId,
      (sourceIds as string[] | undefined) ?? undefined,
      CONTEXT_CHARS
    );
    if (!passages.length) {
      return NextResponse.json(
        { error: "Add at least one source before asking for a style.", code: "no_sources" },
        { status: 400 }
      );
    }

    let suggestions: StyleSuggestion[] = [];
    let source: "model" | "heuristic" = "model";
    try {
      const raw = await chatJSON<unknown>(
        [
          { role: "system", content: suggestionPrompt(topic) },
          { role: "user", content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}` },
        ],
        0.2
      );
      suggestions = parseSuggestions(raw);
    } catch (e) {
      console.warn("[infographic/suggest] model unavailable, using heuristic:", e instanceof Error ? e.message : e);
    }
    if (!suggestions.length) {
      source = "heuristic";
      suggestions = heuristicSuggestions(passages.map((p) => p.text).join("\n"));
    }
    return ok({ suggestions, source });
  } catch (e) {
    return fail(e);
  }
}
