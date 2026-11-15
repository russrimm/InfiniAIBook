import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { loadTraining, pngFromDataUrl, saveTrainingContent } from "@/lib/trainingroute";
import type { TrainingContent } from "@/lib/types";

const notebook = nanoid(8);
db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(notebook, "N", "📓", 1);

const insert = (type: string, content: string) => {
  const id = nanoid(10);
  db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)").run(
    id,
    notebook,
    type,
    "Old title",
    content,
    1
  );
  return id;
};

describe("loadTraining / saveTrainingContent", () => {
  it("loads a training artifact with its notebook", () => {
    const id = insert("training", JSON.stringify({ title: "T" }));
    expect(loadTraining(id)).toEqual({ notebookId: notebook, content: { title: "T" } });
  });

  it("returns null for unknown ids, other artifact types and corrupt content", () => {
    expect(loadTraining("nope")).toBeNull();
    expect(loadTraining(insert("quiz", "{}"))).toBeNull();
    expect(loadTraining(insert("training", "{not json"))).toBeNull();
  });

  it("saves content and keeps the artifact title in step", () => {
    const id = insert("training", "{}");
    saveTrainingContent(id, { title: "New title" } as TrainingContent);
    expect(loadTraining(id)?.content).toEqual({ title: "New title" });
    const row = db.prepare("SELECT title FROM artifacts WHERE id = ?").get(id) as { title: string };
    expect(row.title).toBe("New title");
  });
});

describe("pngFromDataUrl", () => {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png = Buffer.concat([Buffer.from(signature), Buffer.alloc(100, 1)]);
  const url = (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`;
  const statusOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as { status?: number }).status;
    }
    return undefined;
  };

  it("decodes a valid PNG data URL", () => {
    expect(pngFromDataUrl(url(png), 1_000_000).equals(png)).toBe(true);
  });

  it("rejects non-strings, other media types and malformed base64 with 400", () => {
    expect(statusOf(() => pngFromDataUrl(undefined, 1000))).toBe(400);
    expect(statusOf(() => pngFromDataUrl(`data:image/jpeg;base64,${png.toString("base64")}`, 1_000_000))).toBe(400);
    expect(statusOf(() => pngFromDataUrl("data:image/png;base64,@@@", 1_000_000))).toBe(400);
  });

  it("rejects bytes that are not a PNG, and PNGs that are too small", () => {
    expect(statusOf(() => pngFromDataUrl(url(Buffer.alloc(100, 7)), 1_000_000))).toBe(400);
    expect(statusOf(() => pngFromDataUrl(url(Buffer.from(signature)), 1_000_000))).toBe(400);
  });

  it("rejects an oversized image with 413 before decoding", () => {
    expect(statusOf(() => pngFromDataUrl(url(png), 50))).toBe(413);
  });
});
