import { readCapped, safeFetch } from "./safefetch";
import { LearnError, normalizeLearnUrl } from "./learnurl";
export { LearnError, normalizeLearnUrl } from "./learnurl";

const MCP_URL = "https://learn.microsoft.com/api/mcp";
const MAX_REPLY_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

export type LearnPassage = { title: string; content: string; url: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolText(body: string): string {
  const messages = body.trimStart().startsWith("{")
    ? [body]
    : body.split(/\r?\n\r?\n/).map((event) =>
        event.split(/\r?\n/).filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart()).join("\n")
      ).filter(Boolean);
  for (const message of messages) {
    let rpc: unknown;
    try {
      rpc = JSON.parse(message);
    } catch {
      throw new LearnError("Microsoft Learn returned an unreadable MCP response.");
    }
    if (!record(rpc)) continue;
    if (record(rpc.error)) {
      const detail = typeof rpc.error.message === "string" ? rpc.error.message : "MCP request failed";
      throw new LearnError(`Microsoft Learn: ${detail}`);
    }
    if (!record(rpc.result)) continue;
    const result = rpc.result;
    const text = Array.isArray(result.content)
      ? result.content.flatMap((item) =>
          record(item) && item.type === "text" && typeof item.text === "string" ? [item.text] : []
        ).join("\n")
      : "";
    if (result.isError) throw new LearnError(`Microsoft Learn: ${text || "Tool request failed"}`);
    if (!text.trim()) throw new LearnError("Microsoft Learn returned empty content.");
    return text;
  }
  throw new LearnError("Microsoft Learn did not return an MCP tool result.");
}

function searchPassages(text: string): LearnPassage[] {
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    throw new LearnError("Microsoft Learn returned unreadable search results.");
  }
  if (!record(reply) || !Array.isArray(reply.results)) {
    throw new LearnError("Microsoft Learn returned an invalid search result.");
  }
  return reply.results.flatMap((item): LearnPassage[] => {
    if (!record(item) || typeof item.contentUrl !== "string" ||
        typeof item.content !== "string" || !item.content.trim()) return [];
    try {
      return [{
        title: typeof item.title === "string" && item.title.trim() ? item.title : "Microsoft Learn",
        url: normalizeLearnUrl(item.contentUrl),
        content: item.content,
      }];
    } catch (e) {
      if (e instanceof LearnError && e.status === 400) return [];
      throw e;
    }
  }).slice(0, 10);
}

/** Tolerant parser retained for best-effort screenshot lookup. */
export function parseLearnSearch(body: string): LearnPassage[] {
  try {
    return searchPassages(toolText(body));
  } catch (e) {
    console.warn("[learn] Could not parse screenshot search:", e);
    return [];
  }
}

async function callTool(name: string, args: Record<string, string>): Promise<string> {
  try {
    const { res, finalUrl } = await safeFetch(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "user-agent": "InfiniAIBook Microsoft Learn sources",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok || finalUrl !== MCP_URL) {
      await res.body?.cancel();
      throw new LearnError(`Microsoft Learn returned HTTP ${res.status}${finalUrl !== MCP_URL ? " at an unexpected endpoint" : ""}. Try again shortly.`);
    }
    return toolText((await readCapped(res, MAX_REPLY_BYTES)).toString("utf8"));
  } catch (e) {
    if (e instanceof LearnError) throw e;
    throw new LearnError(`Microsoft Learn could not be reached: ${e instanceof Error ? e.message : "Request failed"}`);
  }
}

export async function searchLearn(query: string): Promise<LearnPassage[]> {
  const topic = query.trim();
  if (!topic) throw new LearnError("Enter a topic to search Microsoft Learn.", 400);
  if (topic.length > 1000) throw new LearnError("Microsoft Learn search topics must be 1,000 characters or fewer.", 400);
  return searchPassages(await callTool("microsoft_docs_search", { query: topic }));
}

export async function fetchLearnPage(input: string): Promise<{ title: string; url: string; text: string }> {
  const url = normalizeLearnUrl(input);
  const text = (await callTool("microsoft_docs_fetch", { url })).trim();
  const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() || "Microsoft Learn";
  return { title, url, text };
}
