import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";

describe("settings", () => {
  it("returns null for a key that was never set", () => {
    expect(getSetting("missing_key")).toBeNull();
  });

  it("stores a value and overwrites it on a second write", () => {
    setSetting("chat_model", "gpt-a");
    expect(getSetting("chat_model")).toBe("gpt-a");
    setSetting("chat_model", "gpt-b");
    expect(getSetting("chat_model")).toBe("gpt-b");
    const rows = db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = ?").get("chat_model") as { n: number };
    expect(rows.n).toBe(1);
  });

  it("clears a setting when given null or an empty string", () => {
    setSetting("embed_model", "m1");
    setSetting("embed_model", null);
    expect(getSetting("embed_model")).toBeNull();

    setSetting("embed_model", "m2");
    setSetting("embed_model", "");
    expect(getSetting("embed_model")).toBeNull();
  });

  it("keeps settings independent of each other", () => {
    setSetting("image_model", "img");
    setSetting("vision_model", "vis");
    setSetting("image_model", null);
    expect(getSetting("vision_model")).toBe("vis");
  });
});
