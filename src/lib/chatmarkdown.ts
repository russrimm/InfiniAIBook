import { UNCITED_LABEL } from "./citations";
import type { ChatSession, Citation, Message } from "./types";

/** Appended to an answer the user stopped, so the saved turn says so. */
export const STOPPED_MARK = "\n\n_(Stopped before the answer was finished.)_";

const SNIPPET_CHARS = 160;

/** One readable line per cited passage: marker, source, where in it, and the start of the excerpt. */
export function citationLines(citations: Citation[] | undefined): string[] {
  const byMarker = new Map<number, Citation>();
  for (const c of citations ?? []) if (!byMarker.has(c.n)) byMarker.set(c.n, c);
  return [...byMarker.values()]
    .sort((a, b) => a.n - b.n)
    .map((c) => {
      const where = c.url ? `live excerpt, ${c.url}` : `part ${c.part}`;
      const snippet = c.snippet.replace(/\s+/g, " ").trim();
      const clipped = snippet.length > SNIPPET_CHARS ? snippet.slice(0, SNIPPET_CHARS).trimEnd() : snippet;
      return `[${c.n}] ${c.sourceTitle} (${where})${clipped ? `: “${clipped}…”` : ""}`;
    });
}

/**
 * The text copied from one message. An answer keeps its [n] markers and gains
 * a Sources list, so the claims stay traceable after they leave the app.
 */
export function messageToMarkdown(m: Pick<Message, "role" | "content" | "citations">): string {
  const body = m.content.trim();
  if (m.role === "user") return body;
  const lines = citationLines(m.citations);
  if (!lines.length) return body;
  return `${body}\n\n**Sources**\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

const quote = (text: string) =>
  text
    .trim()
    .split("\n")
    .map((l) => (l ? `> ${l}` : ">"))
    .join("\n");

/** A whole chat as a Markdown document, with each answer's sources beneath it. */
export function chatToMarkdown(
  session: Pick<ChatSession, "title">,
  messages: Pick<Message, "role" | "content" | "citations">[],
  opts: { notebookTitle?: string; exportedAt?: Date } = {}
): string {
  const day = (opts.exportedAt ?? new Date()).toISOString().slice(0, 10);
  const meta = [
    opts.notebookTitle ? `Notebook: ${opts.notebookTitle}` : null,
    `Exported ${day}`,
    `${messages.length} message${messages.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const out = [`# ${session.title.replace(/\s+/g, " ").trim() || "Chat"}`, `_${meta}_`];
  for (const m of messages) {
    if (m.role === "user") {
      out.push(`## You\n\n${quote(m.content)}`);
      continue;
    }
    const body = m.content.trim();
    const lines = citationLines(m.citations);
    let section = `## Assistant\n\n${body || "_No answer was returned._"}`;
    if (lines.length) section += `\n\n**Sources**\n${lines.map((l) => `- ${l}`).join("\n")}`;
    else if (body) section += `\n\n_${UNCITED_LABEL}_`;
    out.push(section);
  }
  return out.join("\n\n") + "\n";
}

/** A safe download name derived from the chat title. */
export function exportFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "chat"}.md`;
}
