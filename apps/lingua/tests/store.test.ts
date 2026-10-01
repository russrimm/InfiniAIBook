import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  resetDbForTests,
  saveRecap,
  saveTranscript,
} from "@/lib/server/db";
import { SetupSchema, resolveSetup } from "@/lib/setup";
import { buildRecapMessages, fallbackRecap, targetShare } from "@/lib/recap";
import type { Transcript } from "@/lib/types";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lingua-test-"));
  process.env.DATA_DIR = dir;
  resetDbForTests();
});

afterAll(() => {
  resetDbForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const transcript: Transcript = {
  turns: [
    { role: "partner", text: "¡Hola! ¿Qué te pongo?", lang: "es", at: 0 },
    { role: "learner", text: "Quiero un cafe con leche por favor", lang: "es", at: 3000 },
    { role: "partner", text: "Claro, un café con leche.", lang: "es", at: 6000, gloss: "Sure, a latte." },
    { role: "learner", text: "how much is it", lang: "en", at: 9000 },
  ],
  corrections: [
    { turnIndex: 1, learnerSaid: "cafe", corrected: "café", explanation: "Accent on the e.", category: "other" },
    { turnIndex: 1, learnerSaid: "cafe", corrected: "café", explanation: "Accent on the e.", category: "other" },
  ],
  vocabulary: [{ term: "¿Qué te pongo?", translation: "What can I get you?" }],
  goalsDone: ["greet", "order"],
  durationSec: 12,
  ended: true,
};

describe("session store", () => {
  it("creates, saves, lists and deletes a session", () => {
    const id = createSession({ target: "es", support: "en", level: "A2", scenario: "cafe", persona: "es-lucia" });
    expect(listSessions().some((s) => s.id === id)).toBe(false); // nothing said yet

    expect(saveTranscript(id, transcript)).toBe(true);
    const listed = listSessions().find((s) => s.id === id)!;
    expect(listed).toMatchObject({ turnCount: 4, durationSec: 12, hasRecap: false });
    expect(listed.endedAt).not.toBeNull();

    const s = resolveSetup(SetupSchema.parse({ target: "es", support: "en", level: "A2", scenario: "cafe" }));
    saveRecap(id, fallbackRecap(s, transcript));
    const got = getSession(id)!;
    expect(got.transcript.turns[2].gloss).toBe("Sure, a latte.");
    expect(got.recap?.mistakes).toHaveLength(1);

    expect(deleteSession(id)).toBe(true);
    expect(getSession(id)).toBeNull();
  });

  it("reports a missing session", () => {
    expect(saveTranscript("nope", transcript)).toBe(false);
  });
});

describe("recap", () => {
  const s = resolveSetup(SetupSchema.parse({ target: "es", support: "en", level: "A2", scenario: "cafe" }));

  it("measures how much of the learner's speech was in the target language", () => {
    expect(targetShare(s, transcript)).toBe(64); // 7 of 11 words
  });

  it("builds a fallback from the partner's notes", () => {
    const r = fallbackRecap(s, transcript);
    expect(r.strengths).toEqual(["Greet the server", "Order a drink and something to eat"]);
    expect(r.mistakes).toEqual([{ said: "cafe", better: "café", why: "Accent on the e." }]);
    expect(r.vocabulary[0]).toMatchObject({ term: "¿Qué te pongo?", meaning: "What can I get you?" });
  });

  it("asks the model for explanations in the learner's language", () => {
    const [system, user] = buildRecapMessages(s, transcript);
    expect(system.content).toContain("Write every explanation, summary and next step in English");
    expect(user.content).toContain("Learner: Quiero un cafe con leche por favor");
    expect(user.content).toContain("Lucía: ¡Hola!");
  });
});
