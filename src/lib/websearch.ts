import * as cheerio from "cheerio";
import { FETCH_HEADERS } from "./ingest";
import { safeFetch } from "./safefetch";

/**
 * Web search for source discovery.
 *
 * Bing RSS is the primary provider and needs no key. Configured API providers
 * are fallbacks when Bing fails or returns no usable results.
 */

const SEARCH_TIMEOUT_MS = 12_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  host: string;
  provider: string;
  /** Undefined until checked; false when the site refuses automated access. */
  reachable?: boolean;
  status?: number | "error";
};

export class SearchUnavailableError extends Error {}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Reject results that cannot become useful sources. */
function usable(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const host = hostOf(url);
  if (!host) return false;
  // Aggregators and walled gardens that will not yield readable article text.
  return !/^(?:duckduckgo\.com|google\.[a-z.]+|bing\.com|facebook\.com|x\.com|twitter\.com|instagram\.com|tiktok\.com|pinterest\.[a-z.]+)$/i.test(
    host
  );
}

type Provider = {
  name: string;
  available: () => boolean;
  run: (query: string, limit: number) => Promise<SearchHit[]>;
};

const tavily: Provider = {
  name: "tavily",
  available: () => Boolean(process.env.TAVILY_API_KEY?.trim()),
  run: async (query, limit) => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: limit,
        search_depth: "basic",
      }),
    });
    if (!res.ok) throw new Error(`Tavily returned ${res.status}`);
    const j = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (j.results ?? []).map((r) => ({
      title: r.title ?? r.url ?? "",
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 300),
      host: hostOf(r.url ?? ""),
      provider: "tavily",
    }));
  },
};

const brave: Provider = {
  name: "brave",
  available: () => Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
  run: async (query, limit) => {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
      {
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        headers: {
          accept: "application/json",
          "x-subscription-token": process.env.BRAVE_SEARCH_API_KEY ?? "",
        },
      }
    );
    if (!res.ok) throw new Error(`Brave returned ${res.status}`);
    const j = (await res.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    return (j.web?.results ?? []).map((r) => ({
      title: stripTags(r.title ?? ""),
      url: r.url ?? "",
      snippet: stripTags(r.description ?? ""),
      host: hostOf(r.url ?? ""),
      provider: "brave",
    }));
  },
};

const googleCse: Provider = {
  name: "google",
  available: () =>
    Boolean(
      (process.env.GOOGLE_SEARCH_API_KEY || process.env.YOUTUBE_API_KEY)?.trim() &&
        process.env.GOOGLE_SEARCH_CX?.trim()
    ),
  run: async (query, limit) => {
    const key = (process.env.GOOGLE_SEARCH_API_KEY || process.env.YOUTUBE_API_KEY)?.trim();
    const cx = process.env.GOOGLE_SEARCH_CX?.trim();
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(
        query
      )}&num=${Math.min(limit, 10)}`,
      { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) }
    );
    if (!res.ok) {
      const body = await res.text();
      let reason = `${res.status}`;
      try {
        reason = JSON.parse(body).error?.errors?.[0]?.reason ?? reason;
      } catch {
        /* keep status */
      }
      throw new Error(`Google Custom Search returned ${reason}`);
    }
    const j = (await res.json()) as {
      items?: { title?: string; link?: string; snippet?: string }[];
    };
    return (j.items ?? []).map((r) => ({
      title: stripTags(r.title ?? ""),
      url: r.link ?? "",
      snippet: stripTags(r.snippet ?? ""),
      host: hostOf(r.link ?? ""),
      provider: "google",
    }));
  },
};

const bing: Provider = {
  name: "bing",
  available: () => true,
  run: async (query, limit) => {
    const res = await fetch(
      `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`,
      {
        headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      }
    );
    if (!res.ok) throw new Error(`Bing returned ${res.status}`);
    const $ = cheerio.load(await res.text(), { xml: true });
    if (!$("rss > channel").length) {
      throw new SearchUnavailableError("Bing did not return a search feed.");
    }
    return $("channel > item")
      .toArray()
      .map((item): SearchHit => {
        const url = $(item).children("link").text().trim();
        return {
          title: stripTags($(item).children("title").text()),
          url,
          snippet: stripTags($(item).children("description").text()).slice(0, 300),
          host: hostOf(url),
          provider: "bing",
        };
      })
      .filter((hit) => usable(hit.url) && hit.title)
      .slice(0, limit);
  },
};

const PROVIDERS = [bing, tavily, brave, googleCse];

export function activeProvider(): string {
  return (PROVIDERS.find((p) => p.available()) ?? bing).name;
}

async function searchOnce(query: string, limit: number): Promise<SearchHit[]> {
  const errors: string[] = [];
  let answered = false;
  for (const p of PROVIDERS) {
    if (!p.available()) continue;
    try {
      const hits = (await p.run(query, limit)).filter((hit) => usable(hit.url) && hit.title);
      answered = true;
      if (hits.length) {
        if (errors.length) console.warn("[search]", errors.join(" | "));
        return hits;
      }
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  if (errors.length) console.warn("[search]", errors.join(" | "));
  if (!answered) throw new SearchUnavailableError(errors.join(" | "));
  return [];
}

/** Run several queries and merge, keeping the best-ranked copy of each URL. */
export async function searchWeb(
  queries: string[],
  limitPerQuery = 10
): Promise<SearchHit[]> {
  const settled = await Promise.allSettled(
    queries.map((q) => searchOnce(q, limitPerQuery))
  );
  if (settled.length && settled.every((result) => result.status === "rejected")) {
    const reasons = [...new Set(settled.map((result) =>
      result.reason instanceof Error ? result.reason.message : "Search request failed"
    ))];
    throw new SearchUnavailableError(
      `Web search is unavailable: ${reasons.join(" | ")}. Try again shortly or add a link directly. ` +
      "For an API fallback, configure TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, " +
      "or GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX on the app server and restart it."
    );
  }

  const byUrl = new Map<string, SearchHit>();
  const rank = new Map<string, number>();

  settled.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((hit, i) => {
      if (!usable(hit.url) || !hit.title) return;
      const key = hit.url.replace(/[#?].*$/, "").replace(/\/$/, "");
      if (!byUrl.has(key)) {
        byUrl.set(key, hit);
        rank.set(key, i);
      } else if (i < (rank.get(key) ?? 99)) {
        rank.set(key, i);
      }
    });
  });

  return [...byUrl.entries()]
    .sort((a, b) => (rank.get(a[0]) ?? 99) - (rank.get(b[0]) ?? 99))
    .map(([, hit]) => hit);
}

/**
 * Many publishers refuse automated fetches, and a discovered link the user did
 * not choose is especially annoying when it fails. A parallel HEAD probe
 * predicts this accurately and costs about a second for a full result page.
 */
export async function checkReachable(
  hits: SearchHit[],
  timeoutMs = 4000
): Promise<SearchHit[]> {
  return Promise.all(
    hits.map(async (hit) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // Guarded like ingestion: these URLs come from a search provider, so
        // they are no more trustworthy than a pasted link.
        const { res } = await safeFetch(hit.url, {
          method: "HEAD",
          // Same headers ingestion will use, so this predicts the real result
          // rather than testing a different request.
          headers: FETCH_HEADERS,
          signal: controller.signal,
        });
        // 405 means HEAD specifically is unsupported, not that we are blocked.
        const reachable = res.ok || res.status === 405;
        return { ...hit, reachable, status: res.status };
      } catch {
        return { ...hit, reachable: false, status: "error" as const };
      } finally {
        clearTimeout(timer);
      }
    })
  );
}
