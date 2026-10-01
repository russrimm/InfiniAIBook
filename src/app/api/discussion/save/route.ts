import { NextResponse } from "next/server";
import { z } from "zod";
import { chatText, type ChatMsg } from "@/lib/ai";
import { GROUNDING_RULES } from "@/lib/studio";
import { createNote } from "@/lib/notes";
import {
  DiscussionSetupSchema,
  MODES,
  SavedResultSchema,
  SavedTurnSchema,
  discussionNote,
  hostName,
  scoreLine,
  transcriptMarkdown,
  type DiscussionSetup,
  type SavedResult,
  type SavedTurn,
} from "@/lib/discussion";
import { notebookTitle, passageTexts } from "@/lib/discussionServer";
import { discussionFail } from "@/lib/discussionHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CitationSchema = z.object({
  n: z.number().int().positive(),
  passageId: z.string().max(64),
  sourceId: z.string().max(64),
  sourceTitle: z.string().max(500),
  part: z.number().int().positive(),
  snippet: z.string().max(1000),
});

const Body = z.object({
  notebookId: z.string().min(1).max(64),
  setup: DiscussionSetupSchema,
  turns: z.array(SavedTurnSchema).max(2000),
  citations: z.array(CitationSchema).max(500).default([]),
  results: z.array(SavedResultSchema).max(200).default([]),
  durationSec: z.number().int().min(0).max(24 * 3600),
});

/** Longest transcript sent for the summary; the end matters most if trimmed. */
const MAX_TRANSCRIPT_CHARS = 40_000;

async function summarize(
  setup: DiscussionSetup,
  turns: SavedTurn[],
  results: SavedResult[],
  excerpts: string
): Promise<string> {
  const m = MODES[setup.mode];
  let transcript = transcriptMarkdown(turns, hostName(setup.voice));
  if (transcript.length > MAX_TRANSCRIPT_CHARS) transcript = "…\n\n" + transcript.slice(-MAX_TRANSCRIPT_CHARS);
  const score = scoreLine(results);
  const messages: ChatMsg[] = [
    {
      role: "system",
      content: `${GROUNDING_RULES}

You are writing the takeaways of a live spoken ${m.label.toLowerCase()} between the user and an AI, about the user's sources.
Cover ${m.summary}.
Judge statements made in the conversation against the excerpts: point out anything said that the excerpts contradict or don't support.
Write Markdown: short bullets under two or three bold lead-ins, under 300 words. No title. Cite excerpt numbers like [3] where they apply, using only the numbers given.`,
    },
    {
      role: "user",
      content: [
        excerpts ? `CITED EXCERPTS\n==============\n${excerpts}` : "No excerpts were cited during the conversation.",
        score ? `Recorded score: ${score}.` : "",
        `TRANSCRIPT\n==========\n${transcript}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
  return chatText(messages, 0.3);
}

/** Save a finished discussion as a note, with AI takeaways when the chat model is available. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    const { notebookId, setup, turns, citations, results, durationSec } = parsed.data;
    if (!notebookTitle(notebookId)) return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
    if (!turns.some((t) => t.text.trim())) {
      return NextResponse.json({ error: "Nothing was said, so there is nothing to save." }, { status: 400 });
    }

    const used = new Set(turns.flatMap((t) => t.cites));
    const cited = citations.filter((c) => used.has(c.n));
    const texts = passageTexts(cited.map((c) => c.passageId));
    const excerpts = cited
      .map((c) => `[${c.n}] (source: "${c.sourceTitle}", part ${c.part})\n${texts.get(c.passageId) ?? c.snippet}`)
      .join("\n\n---\n\n");

    let summary: string | null = null;
    let warning: string | undefined;
    try {
      summary = await summarize(setup, turns, results, excerpts);
    } catch (e) {
      // The transcript is the valuable part; save it even if the summary fails.
      console.warn("[discussion] summary failed; saving the transcript only", e);
      warning = "Saved the transcript, but the takeaways could not be written.";
    }

    const { title, content } = discussionNote({ setup, turns, results, summary, durationSec, date: new Date() });
    const note = createNote({
      notebookId,
      title,
      content,
      kind: "ai",
      citations: cited.map((c) => ({
        n: c.n,
        sourceId: c.sourceId,
        sourceTitle: c.sourceTitle,
        part: c.part,
        snippet: c.snippet,
      })),
    });
    return NextResponse.json({ note, warning }, { status: 201 });
  } catch (e) {
    return discussionFail(e);
  }
}
