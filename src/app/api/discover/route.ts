import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatJSON } from "@/lib/ai";
import { activeProvider, checkReachable, searchWeb, type SearchHit } from "@/lib/websearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Turn a plain-language topic into a few focused search queries. A single
 * literal query tends to return one narrow slice; several angles give the user
 * a genuine choice of sources. Falls back to the raw topic if the model is
 * unavailable, so discovery still works without Azure OpenAI configured.
 */
async function expandQueries(topic: string): Promise<string[]> {
  try {
    const out = await chatJSON<{ queries?: unknown }>(
      [
        {
          role: "system",
          content: `Turn the user's research topic into web search queries.
Respond with a single JSON object only: { "queries": [string] }
Give 3 queries: the topic itself as a searcher would phrase it, then two that
approach it from materially different angles (for example an authoritative
overview, and a specific mechanism, debate or application).
Each query is 3-10 words, plain keywords, no quotes or operators.`,
        },
        { role: "user", content: topic },
      ],
      0.4
    );
    const queries = Array.isArray(out.queries)
      ? out.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 2)
      : [];
    const unique = [...new Set([topic, ...queries.map((q) => q.trim())])];
    return unique.slice(0, 4);
  } catch {
    return [topic];
  }
}

export async function POST(req: Request) {
  try {
    const { notebookId, topic, expand } = (await req.json()) as {
      notebookId?: string;
      topic: string;
      expand?: boolean;
    };

    const query = topic?.trim();
    if (!query) {
      return NextResponse.json({ error: "Enter a topic to search for." }, { status: 400 });
    }

    const queries = expand === false ? [query] : await expandQueries(query);
    const hits: SearchHit[] = await searchWeb(queries, 10);

    if (!hits.length) {
      return NextResponse.json(
        {
          error:
            "No results came back. The search provider may be rate-limiting this network — try again shortly, or add the link directly.",
        },
        { status: 502 }
      );
    }

    // Flag anything already in this notebook so the user cannot add duplicates.
    let existing = new Set<string>();
    if (notebookId) {
      const rows = db
        .prepare("SELECT url FROM sources WHERE notebook_id = ? AND url IS NOT NULL")
        .all(notebookId) as unknown as { url: string }[];
      existing = new Set(
        rows.map((r) => r.url.replace(/[#?].*$/, "").replace(/\/$/, ""))
      );
    }

    const canonical = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "");
    const checked = await checkReachable(hits.slice(0, 24));

    // Surface the sources that will actually ingest, without hiding the rest.
    const results = checked
      .map((h) => ({ ...h, added: existing.has(canonical(h.url)) }))
      .sort((a, b) => Number(b.reachable ?? true) - Number(a.reachable ?? true));

    return ok({ queries, provider: activeProvider(), results });
  } catch (e) {
    return fail(e);
  }
}
