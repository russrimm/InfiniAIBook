import { FETCH_HEADERS } from "./ingest";

/**
 * Web search for source discovery.
 *
 * Providers are tried in order of result quality. The DuckDuckGo HTML endpoint
 * is last but needs no key, so discovery works out of the box; setting any of
 * the API keys below simply improves results.
 */

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
      )}&num=${Math.min(limit, 10)}`
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

const duckduckgo: Provider = {
  name: "duckduckgo",
  available: () => true,
  run: async (query, limit) => {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" } }
    );
    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
    const html = await res.text();
    if (/anomaly|unusual traffic/i.test(html)) {
      throw new SearchUnavailableError("DuckDuckGo rate-limited this network.");
    }

    const hits: SearchHit[] = [];
    const re =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="[^"]*result__a|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && hits.length < limit) {
      let href = m[1].replace(/&amp;/g, "&");
      // Results are wrapped in a redirect carrying the real target in `uddg`.
      const redirect = /[?&]uddg=([^&]+)/.exec(href);
      if (redirect) href = decodeURIComponent(redirect[1]);
      if (!usable(href)) continue;
      const snip = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(m[3]);
      hits.push({
        title: stripTags(m[2]),
        url: href,
        snippet: snip ? stripTags(snip[1]).slice(0, 300) : "",
        host: hostOf(href),
        provider: "duckduckgo",
      });
    }
    return hits;
  },
};

const PROVIDERS = [tavily, brave, googleCse, duckduckgo];

export function activeProvider(): string {
  return (PROVIDERS.find((p) => p.available()) ?? duckduckgo).name;
}

async function searchOnce(query: string, limit: number): Promise<SearchHit[]> {
  const errors: string[] = [];
  for (const p of PROVIDERS) {
    if (!p.available()) continue;
    try {
      const hits = await p.run(query, limit);
      if (hits.length) return hits;
      errors.push(`${p.name}: no results`);
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  if (errors.length) console.warn("[search]", errors.join(" | "));
  return [];
}

/** Run several queries and merge, keeping the best-ranked copy of each URL. */
export async function searchWeb(
  queries: string[],
  limitPerQuery = 10
): Promise<SearchHit[]> {
  const settled = await Promise.all(
    queries.map((q) => searchOnce(q, limitPerQuery).catch(() => [] as SearchHit[]))
  );

  const byUrl = new Map<string, SearchHit>();
  const rank = new Map<string, number>();

  settled.forEach((hits) => {
    hits.forEach((hit, i) => {
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
        const res = await fetch(hit.url, {
          method: "HEAD",
          // Same headers ingestion will use, so this predicts the real result
          // rather than testing a different request.
          headers: FETCH_HEADERS,
          signal: controller.signal,
          redirect: "follow",
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
