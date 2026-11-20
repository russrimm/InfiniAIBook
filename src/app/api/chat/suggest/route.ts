import { ok, fail, readBody } from "@/lib/http";
import { getSession, sessionMessages } from "@/lib/sessions";
import { suggestFollowUps } from "@/lib/chatsuggest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Follow-up questions for a chat's latest answer. Only the last answer gets
 * them, so a stale click cannot ask about a conversation that has moved on.
 */
export async function POST(req: Request) {
  try {
    const { sessionId, messageId } = (await readBody(req)) as { sessionId?: string; messageId?: string };
    if (!sessionId || !messageId) {
      return NextResponse.json({ error: "Missing sessionId or messageId" }, { status: 400 });
    }
    if (!getSession(sessionId)) {
      return NextResponse.json({ error: "That chat no longer exists." }, { status: 404 });
    }
    const messages = sessionMessages(sessionId);
    const index = messages.findIndex((m) => m.id === messageId);
    if (index < 0) return NextResponse.json({ error: "That message no longer exists." }, { status: 404 });
    const answer = messages[index];
    const question = messages[index - 1];
    if (answer.role !== "assistant" || index !== messages.length - 1 || question?.role !== "user") {
      return NextResponse.json({ error: "Only the latest answer has suggestions." }, { status: 409 });
    }
    const suggestions = await suggestFollowUps({
      answerId: answer.id,
      question: question.content,
      answer: answer.content,
      citations: answer.citations ?? [],
    });
    return ok({ suggestions });
  } catch (e) {
    return fail(e);
  }
}
