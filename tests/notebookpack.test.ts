import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { exportNotebookZip, importNotebookZip } from "@/lib/notebookpack";
import { listNotes } from "@/lib/notes";
import { listSessions, sessionMessages } from "@/lib/sessions";

describe("notebook export and import", () => {
  it("round-trips sources, notes and cited chats under new ids", async () => {
    const notebookId = nanoid(12);
    const sourceId = nanoid(12);
    const sessionId = nanoid(12);
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?, ?, ?, ?)").run(
      notebookId,
      "Field notes",
      "🧪",
      1
    );
    db.prepare(
      `INSERT INTO sources (id, notebook_id, title, kind, url, text, chars, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sourceId, notebookId, "Plot", "text", null, "Rain fell on Tuesday.", 22, 2);
    db.prepare(
      `INSERT INTO notes (id, notebook_id, title, content, kind, source_id, citations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(12), notebookId, "Remember", "Check the plot.", "human", sourceId, null, 3, 3);
    db.prepare(
      `INSERT INTO chat_sessions (id, notebook_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, notebookId, "Chat", 4, 4);
    db.prepare(
      `INSERT INTO messages (id, notebook_id, session_id, role, content, citations, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nanoid(12),
      notebookId,
      sessionId,
      "assistant",
      "It rained [1].",
      JSON.stringify([{ n: 1, sourceId, sourceTitle: "Plot", part: 1, snippet: "Rain fell" }]),
      5
    );

    const packed = await exportNotebookZip(notebookId);
    expect(packed?.filename).toBe("Field-notes.zip");
    db.prepare("DELETE FROM notebooks WHERE id = ?").run(notebookId);

    const imported = await importNotebookZip(packed!.buffer);
    expect(imported.title).toBe("Field notes");
    expect(imported.id).not.toBe(notebookId);

    const source = db
      .prepare("SELECT id, text FROM sources WHERE notebook_id = ?")
      .get(imported.id) as { id: string; text: string };
    expect(source.text).toBe("Rain fell on Tuesday.");
    expect(listNotes(imported.id)[0]?.content).toBe("Check the plot.");

    const session = listSessions(imported.id)[0];
    const message = sessionMessages(session.id)[0];
    expect(message.content).toBe("It rained [1].");
    expect(message.citations?.[0]?.sourceId).toBe(source.id);
    expect(message.citations?.[0]?.sourceId).not.toBe(sourceId);
  });
});
