import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatJSON } from "@/lib/ai";
import { activeProvider, checkReachable, searchWeb, SearchUnavailableError, type SearchHit } from "@/lib/websearch";
import { LearnError } from "@/lib/learn";
import { canonicalLearnUrl, discoverLearn, learnResultCap } from "@/lib/learndiscover";

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

/** URLs already saved in the notebook, so the picker can flag them rather than add duplicates. */
function existingUrls(notebookId: string | undefined, canonical: (url: string) => string): Set<string> {
  if (!notebookId) return new Set();
  const rows = db
    .prepare("SELECT url FROM sources WHERE notebook_id = ? AND url IS NOT NULL")
    .all(notebookId) as unknown as { url: string }[];
  return new Set(rows.map((r) => canonical(r.url)));
}

async function discoverFromLearn(query: string, notebookId: string | undefined, offset: unknown) {
  const start = typeof offset === "number" && Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const found = await discoverLearn(query, start);
  const existing = existingUrls(notebookId, canonicalLearnUrl);
  return ok({
    queries: found.queries,
    provider: "microsoft-learn",
    results: found.results.map((hit) => ({ ...hit, added: existing.has(canonicalLearnUrl(hit.url)) })),
    nextOffset: found.nextOffset,
    limit: learnResultCap(),
    warnings: found.warnings,
  });
}

export async function POST(req: Request) {
  try {
    const { notebookId, topic, expand, provider, offset } = (await req.json()) as {
      notebookId?: string;
      topic: string;
      expand?: boolean;
      provider?: string;
      offset?: number;
    };

    const query = typeof topic === "string" ? topic.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "Enter a topic to search for." }, { status: 400 });
    }

    if (provider !== undefined && provider !== "microsoft-learn") {
      return NextResponse.json({ error: "Unknown discovery provider." }, { status: 400 });
    }
    const learn = provider === "microsoft-learn";
    if (learn) return await discoverFromLearn(query, notebookId, offset);
    const queries = expand === false ? [query] : await expandQueries(query);
    const hits: SearchHit[] = await searchWeb(queries, 10);

    const canonical = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "");
    const seen = new Set<string>();
    const uniqueHits = hits.filter((hit) => {
      const key = canonical(hit.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Flag anything already in this notebook so the user cannot add duplicates.
    let existing = new Set<string>();
    if (notebookId) {
      const rows = db
        .prepare("SELECT url FROM sources WHERE notebook_id = ? AND url IS NOT NULL")
        .all(notebookId) as unknown as { url: string }[];
      existing = new Set(rows.map((r) => canonical(r.url)));
    }

    const checked = learn ? uniqueHits : await checkReachable(uniqueHits.slice(0, 24));

    // Surface the sources that will actually ingest, without hiding the rest.
    const results = checked
      .map((h) => ({ ...h, added: existing.has(canonical(h.url)) }))
      .sort((a, b) => Number(b.reachable ?? true) - Number(a.reachable ?? true));

    return ok({ queries, provider: hits[0]?.provider ?? activeProvider(), results });
  } catch (e) {
    if (e instanceof LearnError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof SearchUnavailableError) {
      return NextResponse.json(
        { error: e.message, code: "search_unavailable" },
        { status: 502 }
      );
    }
    return fail(e);
  }
}
