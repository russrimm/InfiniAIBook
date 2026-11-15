import { db } from "@/lib/db";
import { fail } from "@/lib/http";
import { chatToMarkdown, exportFilename } from "@/lib/chatmarkdown";
import { getSession, sessionMessages } from "@/lib/sessions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The whole chat as a Markdown download, with each answer's sources beneath it. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const notebook = db
      .prepare("SELECT title FROM notebooks WHERE id = ?")
      .get(session.notebookId) as unknown as { title: string } | undefined;
    const markdown = chatToMarkdown(session, sessionMessages(id), { notebookTitle: notebook?.title });
    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(session.title)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
