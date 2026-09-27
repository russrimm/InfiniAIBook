import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db, transaction } from "@/lib/db";

describe("transaction", () => {
  it("commits all writes together", () => {
    const id = nanoid(12);
    transaction(() => {
      db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(id, "A", "📓", 1);
    });
    expect(db.prepare("SELECT id FROM notebooks WHERE id = ?").get(id)).toBeTruthy();
  });

  it("rolls back everything when one write fails", () => {
    const id = nanoid(12);
    expect(() =>
      transaction(() => {
        db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(id, "B", "📓", 1);
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(db.prepare("SELECT id FROM notebooks WHERE id = ?").get(id)).toBeUndefined();
    // The connection is usable afterwards, not stuck in a transaction.
    transaction(() => undefined);
  });

  it("uses synchronous=NORMAL under WAL", () => {
    expect((db.prepare("PRAGMA synchronous").get() as { synchronous: number }).synchronous).toBe(1);
  });
});
