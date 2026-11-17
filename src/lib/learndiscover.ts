import { readCapped, safeFetch } from "./safefetch";
import { LearnError, normalizeLearnUrl, searchLearn } from "./learn";

/** The Learn search endpoint accepts at most 30 results per request. */
export const LEARN_PAGE_SIZE = 30;
const DEFAULT_RESULT_CAP = 100;
const API_URL = "https://learn.microsoft.com/api/search";
const API_TIMEOUT_MS = 15_000;
const MAX_API_REPLY_BYTES = 2 * 1024 * 1024;
/** Wall-clock budget for the optional MCP searches; slower ones are dropped, not awaited. */
const MCP_BUDGET_MS = 20_000;
const MCP_CONCURRENCY = 3;
/** Reciprocal-rank-fusion constant: a larger value flattens the gap between ranks. */
const RRF_K = 10;
/** Broad topics (this many words or fewer) get complementary searches. */
const BROAD_QUERY_WORDS = 3;
const EXPANSIONS = ["overview", "get started", "tutorial", "how to", "concepts"];

/**
 * Most pages one discovery session can list, set by `LEARN_MAX_RESULTS`
 * (default 100, 10 to 300). Each "Load more" fetches the next page of results
 * until this many have been offered.
 */
export function learnResultCap(): number {
  const configured = Number(process.env.LEARN_MAX_RESULTS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_RESULT_CAP;
  return Math.min(300, Math.max(10, Math.floor(configured)));
}

export type LearnHit = {
  title: string;
  url: string;
  snippet: string;
  host: "learn.microsoft.com";
  provider: "microsoft-learn";
  kind: string;
};

export type LearnDiscovery = {
  queries: string[];
  results: LearnHit[];
  /** API offset to request next, or null when nothing more can be loaded. */
  nextOffset: number | null;
  warnings: string[];
};

/** Key for deciding whether two URLs are the same page. */
export function canonicalLearnUrl(input: string): string {
  try {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/[a-z]{2}-[a-z]{2}(?=\/|$)/i, "").replace(/\/+$/, "");
    return `${url.hostname.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return input.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
  }
}

const KINDS: Record<string, string> = {
  documentation: "Documentation",
  training: "Training",
  show: "Videos",
  credential: "Certifications",
};

function kindOf(category: unknown): string {
  const name = typeof category === "string" ? category.trim() : "";
  return KINDS[name.toLowerCase()] ?? (name || "Documentation");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clean(text: string, max = 300): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)#{1,6}\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** One page of Learn's own site search, which supports paging and covers every content type. */
export async function searchLearnApi(
  query: string,
  offset: number,
  top: number,
): Promise<{ hits: LearnHit[]; returned: number }> {
  const url = new URL(API_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("locale", "en-us");
  url.searchParams.set("$top", String(Math.min(LEARN_PAGE_SIZE, Math.max(1, top))));
  url.searchParams.set("$skip", String(Math.max(0, offset)));
  try {
    const { res, finalUrl } = await safeFetch(url.href, {
      headers: { accept: "application/json", "user-agent": "InfiniAIBook Microsoft Learn sources" },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok || new URL(finalUrl).origin + new URL(finalUrl).pathname.toLowerCase() !== API_URL) {
      await res.body?.cancel();
      throw new LearnError(`Microsoft Learn search returned HTTP ${res.status}. Try again shortly.`);
    }
    const body: unknown = JSON.parse((await readCapped(res, MAX_API_REPLY_BYTES)).toString("utf8"));
    if (!record(body) || !Array.isArray(body.results)) {
      throw new LearnError("Microsoft Learn returned an invalid search result.");
    }
    const hits = body.results.flatMap((item): LearnHit[] => {
      if (!record(item) || typeof item.url !== "string") return [];
      let page: string;
      try {
        // Search results carry a locale; saved sources and MCP results do not.
        page = normalizeLearnUrl(item.url).replace(/^(https:\/\/learn\.microsoft\.com)\/[a-z]{2}-[a-z]{2}(?=\/)/i, "$1");
      } catch {
        return [];
      }
      const title = typeof item.title === "string" && item.title.trim() ? clean(item.title, 200) : "Microsoft Learn";
      return [{
        title, url: page, host: "learn.microsoft.com", provider: "microsoft-learn",
        snippet: typeof item.description === "string" ? clean(item.description) : "",
        kind: kindOf(item.category),
      }];
    });
    return { hits, returned: body.results.length };
  } catch (e) {
    if (e instanceof LearnError) throw e;
    throw new LearnError(`Microsoft Learn could not be reached: ${e instanceof Error ? e.message : "Request failed"}`);
  }
}

/** Passage-level semantic search through MCP, reduced to distinct pages in rank order. */
async function searchLearnMcp(query: string): Promise<LearnHit[]> {
  const seen = new Set<string>();
  const hits: LearnHit[] = [];
  for (const passage of await searchLearn(query)) {
    const key = canonicalLearnUrl(passage.url);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      title: passage.title, url: passage.url, host: "learn.microsoft.com", provider: "microsoft-learn",
      snippet: clean(passage.content), kind: "Documentation",
    });
  }
  return hits;
}

export function expansionQueries(query: string): string[] {
  const topic = query.trim();
  if (topic.split(/\s+/).length > BROAD_QUERY_WORDS) return [];
  return EXPANSIONS.map((suffix) => `${topic} ${suffix}`);
}

/** Run `task` over `items` with at most `limit` in flight, keeping results in input order. */
async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await task(items[index]);
    }
  }));
  return out;
}

/**
 * Merge ranked lists by reciprocal rank, so a page that several searches agree
 * on outranks one that a single search placed first. Pages are identified by
 * canonical URL; the first title and snippet seen for a page are kept.
 */
export function mergeRanked(lists: LearnHit[][]): LearnHit[] {
  const merged = new Map<string, { hit: LearnHit; score: number; order: number }>();
  for (const list of lists) {
    const seenInList = new Set<string>();
    let rank = 0;
    for (const hit of list) {
      const key = canonicalLearnUrl(hit.url);
      if (seenInList.has(key)) continue;
      seenInList.add(key);
      const score = 1 / (RRF_K + rank++);
      const known = merged.get(key);
      if (known) {
        known.score += score;
        if (!known.hit.snippet && hit.snippet) known.hit = { ...known.hit, snippet: hit.snippet };
      } else {
        merged.set(key, { hit, score, order: merged.size });
      }
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score || a.order - b.order).map((m) => m.hit);
}

/**
 * Find Microsoft Learn pages for a topic. The first request (`offset` 0) blends
 * Learn's paged site search with MCP passage searches for the topic and, for
 * broad topics, a few complementary angles. Later requests only page the site
 * search. Partial failures become warnings; the call throws only when nothing
 * could be searched.
 */
export async function discoverLearn(query: string, offset = 0): Promise<LearnDiscovery> {
  const topic = query.trim();
  if (!topic) throw new LearnError("Enter a topic to search Microsoft Learn.", 400);
  if (topic.length > 1000) throw new LearnError("Microsoft Learn search topics must be 1,000 characters or fewer.", 400);

  const cap = learnResultCap();
  const start = Math.max(0, Math.floor(offset));
  if (start >= cap) return { queries: [topic], results: [], nextOffset: null, warnings: [] };
  const top = Math.min(LEARN_PAGE_SIZE, cap - start);

  const warnings: string[] = [];
  const queries = [topic, ...(start === 0 ? expansionQueries(topic) : [])];
  const mcpLists: LearnHit[][] = [];
  let firstError: unknown;
  let mcpFailed = 0;

  const api = searchLearnApi(topic, start, top).catch((e: unknown) => {
    firstError ??= e;
    return null;
  });

  const mcp = start === 0
    ? mapLimit(queries, MCP_CONCURRENCY, async (q) => {
        try {
          mcpLists[queries.indexOf(q)] = await searchLearnMcp(q);
        } catch (e) {
          firstError ??= e;
          mcpFailed++;
        }
      })
    : Promise.resolve([]);
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), MCP_BUDGET_MS);
  });
  const mcpState = await Promise.race([mcp.then(() => "done" as const), budget]);
  clearTimeout(timer);
  const pageResult = await api;
  const lists = [...(pageResult ? [pageResult.hits] : []), ...mcpLists.filter(Boolean)];

  if (mcpState === "late") warnings.push("Some Microsoft Learn searches were slow and were skipped.");
  else if (mcpFailed) warnings.push(`${mcpFailed} of ${queries.length} complementary searches failed.`);
  if (start === 0 && !pageResult && lists.length) {
    warnings.push("Microsoft Learn site search is unavailable, so only passage matches are shown.");
  }
  if (!lists.length) {
    throw firstError instanceof LearnError ? firstError : new LearnError("Microsoft Learn search failed. Try again shortly.");
  }

  const results = mergeRanked(lists).slice(0, start === 0 ? cap : top);
  const more = pageResult !== null && pageResult.returned >= top && start + top < cap;
  return { queries, results, nextOffset: more ? start + top : null, warnings };
}
