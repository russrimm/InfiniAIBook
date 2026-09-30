import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  applyReplacements,
  narrationPromptBlock,
  normalizeReplacements,
  readNarration,
} from "@/lib/narration";
import { notebookNarration, saveNotebookNarration } from "@/lib/narrationstore";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import { deleteTrack, listTracks, resolveMusic, saveUpload } from "@/lib/music";
import {
  normalizeEditedScript,
  scriptForNarration,
  scriptOf,
  toSegments,
} from "@/lib/podcastscript";
import { replaceInScenePlan } from "@/lib/videoscript";
import { normalizeScenePlan } from "@/lib/whiteboard";
import { reconcileStalledVideos } from "@/lib/videobuild";

describe("applyReplacements", () => {
  const list = [
    { from: "MCS", to: "Copilot Studio" },
    { from: "synergy", to: "" },
    { from: "AI", to: "artificial intelligence" },
  ];

  it("replaces whole words case-insensitively", () => {
    expect(applyReplacements("MCS is great, and mcs is fast.", list)).toBe(
      "Copilot Studio is great, and Copilot Studio is fast."
    );
  });

  it("leaves partial matches alone", () => {
    expect(applyReplacements("MCSA and AIRPORT and FAIL", list)).toBe("MCSA and AIRPORT and FAIL");
  });

  it("removes terms with an empty replacement and tidies the spacing", () => {
    expect(applyReplacements("Real synergy matters. Synergy, again.", list)).toBe(
      "Real matters. again."
    );
  });

  it("keeps a sentence-initial capital", () => {
    expect(applyReplacements("Ai helps.", [{ from: "ai", to: "machine learning" }])).toBe(
      "Machine learning helps."
    );
  });

  it("does not replace inside a replacement", () => {
    expect(
      applyReplacements("cat dog", [
        { from: "cat", to: "dog" },
        { from: "dog", to: "bird" },
      ])
    ).toBe("dog bird");
  });

  it("is a no-op without rules", () => {
    expect(applyReplacements("MCS", [])).toBe("MCS");
  });
});

describe("narration settings", () => {
  it("normalizes replacements: trims, drops empties and duplicates", () => {
    expect(
      normalizeReplacements([
        { from: "  MCS ", to: " Copilot Studio " },
        { from: "", to: "x" },
        { from: "mcs", to: "dup" },
        { nope: true },
      ])
    ).toEqual([{ from: "MCS", to: "Copilot Studio" }]);
    expect(normalizeReplacements("not json")).toEqual([]);
  });

  it("builds a prompt block only when there is something to say", () => {
    expect(narrationPromptBlock(readNarration({}))).toBe("");
    const block = narrationPromptBlock(
      readNarration({
        instructions: "Narrate in Spanish.",
        replacements: [{ from: "MCS", to: "Copilot Studio" }, { from: "synergy", to: "" }],
      })
    );
    expect(block).toContain("USER NARRATION INSTRUCTIONS");
    expect(block).toContain("Narrate in Spanish.");
    expect(block).toContain('"MCS" → say "Copilot Studio"');
    expect(block).toContain('"synergy" → do not say it at all');
  });

  it("saves and reads per-notebook defaults", () => {
    const id = nanoid(12);
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(
      id,
      "N",
      "📓",
      1
    );
    expect(notebookNarration(id)).toEqual({ instructions: "", replacements: [] });
    saveNotebookNarration(id, {
      instructions: "Be brief.",
      replacements: [{ from: "foo", to: "bar" }],
    });
    expect(notebookNarration(id)).toEqual({
      instructions: "Be brief.",
      replacements: [{ from: "foo", to: "bar" }],
    });
  });
});

describe("music library", () => {
  it("rejects malformed choices", () => {
    expect(normalizeMusicChoice(null)).toBeNull();
    expect(normalizeMusicChoice({ track: "../etc/passwd" })).toBeNull();
    expect(normalizeMusicChoice({ track: "random" })).toEqual({ track: "random", volume: "medium" });
    expect(normalizeMusicChoice({ track: "u-abc", volume: "high" })).toEqual({
      track: "u-abc",
      volume: "high",
    });
  });

  it("uploads, lists, resolves and deletes tracks", () => {
    expect(listTracks()).toEqual([]);
    expect(() => saveUpload("evil.exe", new Uint8Array([1]))).toThrow(/audio file/);
    const t = saveUpload("My Song (final).mp3", new Uint8Array([1, 2, 3]));
    expect(t.name).toBe("My Song final");
    expect(listTracks().map((x) => x.id)).toEqual([t.id]);
    expect(resolveMusic({ track: t.id, volume: "low" })?.gain).toBeCloseTo(0.18);
    expect(resolveMusic({ track: "random", volume: "medium" })?.id).toBe(t.id);
    expect(resolveMusic({ track: "u-missing", volume: "medium" })).toBeNull();
    expect(deleteTrack(t.id)).toBe(true);
    expect(listTracks()).toEqual([]);
  });

  it("includes read-only tracks from MOTION_MUSIC_DIR", () => {
    const dir = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "folder-"));
    fs.writeFileSync(path.join(dir, "Ambient_Bed.mp3"), "x");
    process.env.MOTION_MUSIC_DIR = dir;
    try {
      const [t] = listTracks();
      expect(t).toMatchObject({ name: "Ambient Bed", source: "folder", deletable: false });
      expect(deleteTrack(t!.id)).toBe(false);
    } finally {
      delete process.env.MOTION_MUSIC_DIR;
    }
  });
});

describe("podcast scripts", () => {
  it("groups turns into segments at chapter marks", () => {
    const script = toSegments({
      turns: [
        { speaker: "a", text: "Intro" },
        { speaker: "b", text: "One" },
        { speaker: "a", text: "Two" },
      ],
      marks: [{ title: "Part one", index: 1 }],
    });
    expect(script.segments).toEqual([
      { title: "", turns: [{ speaker: "a", text: "Intro" }] },
      {
        title: "Part one",
        turns: [
          { speaker: "b", text: "One" },
          { speaker: "a", text: "Two" },
        ],
      },
    ]);
  });

  it("rebuilds a script for overviews made before editing existed", () => {
    const script = scriptOf({
      turns: [
        { speaker: "a", text: "Hi", at: 0 },
        { speaker: "b", text: "There", at: 2.5 },
      ],
      chapters: [{ title: "Start", at: 0 }],
    });
    expect(script.segments).toHaveLength(1);
    expect(script.segments[0]!.title).toBe("Start");
  });

  it("validates edited scripts", () => {
    const script = normalizeEditedScript(
      {
        segments: [
          { title: " Opening ", turns: [{ speaker: "z", text: " Hello " }, { speaker: "b", text: "" }] },
          { title: "Empty", turns: [] },
        ],
      },
      2
    );
    expect(script).toEqual({
      segments: [{ title: "Opening", turns: [{ speaker: "a", text: "Hello" }] }],
    });
  });

  it("enforces replacements and strips stage directions before narration", () => {
    const flat = scriptForNarration(
      {
        segments: [
          { title: "About MCS", turns: [{ speaker: "a", text: "[MUSIC] MCS is here [2]." }] },
        ],
      },
      [{ from: "MCS", to: "Copilot Studio" }]
    );
    expect(flat.turns).toEqual([{ speaker: "a", text: "Copilot Studio is here." }]);
    expect(flat.marks).toEqual([{ title: "About Copilot Studio", index: 0 }]);
  });
});

describe("video scripts", () => {
  it("normalizes a whiteboard plan and applies replacements to spoken and shown text", () => {
    const plan = normalizeScenePlan({
      title: "MCS explained",
      scenes: [
        { title: "Start", drawing: "A box", caption: "MCS", narration: "MCS starts here." },
        { title: "End", drawing: "A circle", caption: "Done", narration: "That is MCS." },
      ],
    });
    expect(plan).not.toBeNull();
    const replaced = replaceInScenePlan(plan!, [{ from: "MCS", to: "Copilot Studio" }]);
    expect(replaced.title).toBe("Copilot Studio explained");
    expect(replaced.scenes[0]!.caption).toBe("Copilot Studio");
    expect(replaced.scenes[1]!.narration).toBe("That is Copilot Studio.");
    // The drawing prompt is not user-facing wording and is left alone.
    expect(replaced.scenes[0]!.drawing).toBe("A box");
  });

  it("rejects a plan with fewer than two usable scenes", () => {
    expect(normalizeScenePlan({ scenes: [{ title: "x", drawing: "y", narration: "z" }] })).toBeNull();
  });

  it("does not mark a video waiting for script review as stalled", () => {
    const nb = nanoid(12);
    const id = nanoid(12);
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(
      nb,
      "N",
      "📓",
      1
    );
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(
      id,
      nb,
      "video",
      "V",
      JSON.stringify({ progress: { stage: "script", done: 0, total: 3 } }),
      1
    );
    expect(reconcileStalledVideos(nb)).toBe(0);
    const row = db.prepare("SELECT content FROM artifacts WHERE id = ?").get(id) as {
      content: string;
    };
    expect(JSON.parse(row.content).progress.stage).toBe("script");
  });
});

describe("review fixes", () => {
  it("keeps the id of a track whose name starts with a dash", async () => {
    const { saveUpload, listTracks, deleteTrack } = await import("@/lib/music");
    const t = saveUpload("音楽-01.mp3", new Uint8Array([1]));
    expect(listTracks().map((x) => x.id)).toContain(t.id);
    expect(deleteTrack(t.id)).toBe(true);
  });

  it("infers settings for overviews made before settings were stored", async () => {
    const { podcastSettings } = await import("@/lib/podcastscript");
    expect(
      podcastSettings({ rate: 1.25, speakers: [{ voice: "en-US-AndrewMultilingualNeural" }] })
    ).toMatchObject({ preset: "classic", rate: 1.25 });
    expect(podcastSettings({ speakers: [{ voice: "Ava" }] }).preset).toBe("conversational");
    expect(podcastSettings({ settings: { preset: "classic", rate: 1 }, rate: 2 }).rate).toBe(1);
  });

  it("releases an overview whose narration died with its process", async () => {
    const { reconcileStalledPodcast, readPodcast } = await import("@/lib/podcaststore");
    const nb = nanoid(12);
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(nb, "N", "📓", 1);
    const insert = (id: string, narratingAt: number) =>
      db.prepare(
        "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
      ).run(id, nb, "podcast", "P", JSON.stringify({ stage: "narrating", narratingAt }), 1);
    insert("stale", 1);
    insert("fresh", Date.now());
    expect(reconcileStalledPodcast("stale")).toBe(true);
    expect(readPodcast("stale")?.stage).toBe("script");
    expect(reconcileStalledPodcast("fresh")).toBe(false);
    expect(readPodcast("fresh")?.stage).toBe("narrating");
  });
});
