import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { imageDir, imagePath, videoDir, videoPath } from "@/lib/paths";
import { duplicateNotebook, exportNotebookZip, importNotebookZip } from "@/lib/notebookpack";
import { chunkText } from "@/lib/ingest";
import { listNotes } from "@/lib/notes";
import { listSessions, sessionMessages } from "@/lib/sessions";
import JSZip from "jszip";

describe("notebook export and import", () => {
  it("preserves live Learn opt-in and defaults older exports to off", async () => {
    const notebookId = nanoid(12);
    db.prepare("INSERT INTO notebooks (id,title,emoji,created_at,live_learn) VALUES (?,?,?,?,?)")
      .run(notebookId, "Learn", "L", 1, 1);
    const packed = await exportNotebookZip(notebookId);
    const restored = await importNotebookZip(packed!.buffer);
    expect(db.prepare("SELECT live_learn FROM notebooks WHERE id=?").get(restored.id)).toMatchObject({ live_learn: 1 });
    const zip = await JSZip.loadAsync(packed!.buffer);
    const manifestName = Object.keys(zip.files).find((name) => name.endsWith(".json"))!;
    const manifest = JSON.parse(await zip.file(manifestName)!.async("string"));
    delete manifest.notebook.liveLearn;
    zip.file(manifestName, JSON.stringify(manifest));
    const legacy = await importNotebookZip(await zip.generateAsync({ type: "nodebuffer" }));
    expect(db.prepare("SELECT live_learn FROM notebooks WHERE id=?").get(legacy.id)).toMatchObject({ live_learn: 0 });
  });

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
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(nanoid(12), notebookId, "report", "Rain", JSON.stringify({
      title: "Rain", markdown: "It rained.", sourceIds: [sourceId],
    }), 2);
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
    const artifact = db.prepare("SELECT content FROM artifacts WHERE notebook_id = ?").get(imported.id);
    expect(JSON.parse(String(artifact?.content)).sourceIds).toEqual([source.id]);
    expect(listNotes(imported.id)[0]?.content).toBe("Check the plot.");

    const session = listSessions(imported.id)[0];
    const message = sessionMessages(session.id)[0];
    expect(message.content).toBe("It rained [1].");
    expect(message.citations?.[0]?.sourceId).toBe(source.id);
    expect(message.citations?.[0]?.sourceId).not.toBe(sourceId);
  });

  it("restores media under new ids and points the saved references at them", async () => {
    const notebookId = nanoid(12);
    const videoId = nanoid(12);
    const pictureId = nanoid(12);
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?, ?, ?, ?)").run(
      notebookId,
      "Media",
      "🎬",
      1
    );
    const training = {
      videoUrl: `/api/video/${videoId}?v=1`,
      captionsUrl: `/api/training/${videoId}/captions?v=1`,
      sections: [{ cues: [{ imageId: pictureId }] }],
      composition: { logoId: pictureId },
    };
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(videoId, notebookId, "training", "Video", JSON.stringify(training), 1);
    fs.mkdirSync(videoDir(), { recursive: true });
    fs.mkdirSync(imageDir(), { recursive: true });
    fs.writeFileSync(videoPath(videoId), "mp4");
    fs.writeFileSync(imagePath(pictureId), "png");

    const packed = await exportNotebookZip(notebookId);
    db.prepare("DELETE FROM notebooks WHERE id = ?").run(notebookId);
    const imported = await importNotebookZip(packed!.buffer);

    const row = db
      .prepare("SELECT id, content FROM artifacts WHERE notebook_id = ?")
      .get(imported.id) as { id: string; content: string };
    const content = JSON.parse(row.content);
    expect(row.id).not.toBe(videoId);
    expect(content.videoUrl).toBe(`/api/video/${row.id}?v=1`);
    expect(content.captionsUrl).toBe(`/api/training/${row.id}/captions?v=1`);
    const newPicture = content.sections[0].cues[0].imageId;
    expect(newPicture).not.toBe(pictureId);
    expect(content.composition.logoId).toBe(newPicture);
    expect(fs.existsSync(videoPath(row.id))).toBe(true);
    expect(fs.existsSync(imagePath(newPicture))).toBe(true);
  });

  it("duplicates a notebook as an independent copy that keeps its embeddings and leaves the original alone", async () => {
    const notebookId = nanoid(12);
    const sourceId = nanoid(12);
    const vector = Buffer.from(new Float32Array([0.25, 0.5, 0.75]).buffer);
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?, ?, ?, ?)").run(notebookId, "Tides", "🌊", 1);
    db.prepare(
      `INSERT INTO sources (id, notebook_id, title, kind, url, text, chars, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sourceId, notebookId, "Tide table", "text", null, "High tide is at noon.", 21, 2);
    // The passage the import will rebuild from the source text, with a vector stored for it.
    for (const [idx, text] of chunkText("High tide is at noon.").entries()) {
      db.prepare(
        "INSERT INTO chunks (id, source_id, notebook_id, idx, text, embedding, embed_model, embed_dims) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(nanoid(12), sourceId, notebookId, idx, text, vector, "test-embed", 3);
    }
    db.prepare(
      `INSERT INTO notes (id, notebook_id, title, content, kind, source_id, citations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(12), notebookId, "Remember", "Check the moon.", "human", sourceId, null, 3, 3);

    const copy = await duplicateNotebook(notebookId);
    expect(copy?.title).toBe("Tides (copy)");
    expect(copy?.id).not.toBe(notebookId);
    expect(db.prepare("SELECT title FROM notebooks WHERE id = ?").get(copy!.id)).toMatchObject({ title: "Tides (copy)" });

    // New ids everywhere, same content.
    const copied = db.prepare("SELECT id, text FROM sources WHERE notebook_id = ?").get(copy!.id) as { id: string; text: string };
    expect(copied.id).not.toBe(sourceId);
    expect(copied.text).toBe("High tide is at noon.");
    expect(listNotes(copy!.id)[0]?.content).toBe("Check the moon.");

    // Search by meaning still works in the copy: the passages came with their vectors.
    const chunk = db
      .prepare("SELECT embedding, embed_model, embed_dims FROM chunks WHERE notebook_id = ?")
      .get(copy!.id) as { embedding: Uint8Array; embed_model: string; embed_dims: number };
    expect(Buffer.from(chunk.embedding).equals(vector)).toBe(true);
    expect(chunk).toMatchObject({ embed_model: "test-embed", embed_dims: 3 });

    // The original is untouched, and editing the copy does not reach it.
    db.prepare("DELETE FROM sources WHERE notebook_id = ?").run(copy!.id);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sources WHERE notebook_id = ?").get(notebookId)).toMatchObject({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE notebook_id = ?").get(notebookId)).toMatchObject({ n: 1 });
  });

  it("reports nothing to duplicate for an unknown notebook", async () => {
    expect(await duplicateNotebook("does-not-exist")).toBeNull();
  });
});
