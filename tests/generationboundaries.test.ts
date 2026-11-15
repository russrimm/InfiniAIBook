import { beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";

const model = vi.hoisted(() => ({
  reply: {} as Record<string, unknown>,
  prompts: [] as { role: string; content: string }[][],
  failures: 0,
}));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  const generate = async (messages: { role: string; content: string }[]) => {
    model.prompts.push(messages);
    if (model.failures-- > 0) throw Object.assign(new Error("Rate limited"), { status: 429 });
    return structuredClone(model.reply);
  };
  return { ...actual, chatJSON: generate, studioJSON: generate, embed: async () => [[1, 0]] };
});
vi.mock("@/lib/voicelist", () => ({
  resolveVoice: async (voice: string) => ({ voice }),
}));

import { db } from "@/lib/db";
import { POST as generate } from "@/app/api/generate/route";
import { POST as podcast } from "@/app/api/podcast/route";
import { POST as video } from "@/app/api/video/route";
import { POST as motion } from "@/app/api/motion/route";
import { POST as training } from "@/app/api/training/route";
import { GET as trainingInfographics } from "@/app/api/training/[id]/infographics/route";
import { PATCH as editTraining } from "@/app/api/training/[id]/route";
import { POST as suggestStyle } from "@/app/api/infographic/suggest/route";
import { sampleCorpus, retrieve } from "@/lib/retrieve";
import { researchPassages } from "@/lib/training";
import { notebookInfographics, planTrainingVisuals, trainingSourcePages } from "@/lib/trainingplan";
import { artifactSourceIds } from "@/lib/artifactsources";
import { DEFAULT_COMPOSITION } from "@/lib/trainingvisuals";

const allowed = "The selected orchard produced 24 crates of apples.";
const unchecked = "UNCHECKED_SOURCE says there were 99 crates.";
const outside = "OTHER_NOTEBOOK discusses ocean tides.";
const note = "NOTE_CONTENT adds an unsupported claim.";

function seed() {
  const nb = nanoid(12);
  const other = nanoid(12);
  for (const id of [nb, other]) {
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(id, "Boundary", "N", 1);
  }
  const source = (book: string, text: string) => {
    const id = nanoid(12);
    db.prepare("INSERT INTO sources (id, notebook_id, title, kind, text, chars, created_at) VALUES (?,?,?,?,?,?,?)")
      .run(id, book, text, "text", text, text.length, 1);
    db.prepare("INSERT INTO chunks (id, source_id, notebook_id, idx, text) VALUES (?,?,?,?,?)")
      .run(nanoid(12), id, book, 0, text);
    return id;
  };
  const selected = source(nb, allowed);
  const unselected = source(nb, unchecked);
  const foreign = source(other, outside);
  db.prepare("INSERT INTO notes (id, notebook_id, title, content, kind, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(nanoid(12), nb, "Unselected note", note, "human", 1, 1);
  return { nb, selected, unselected, foreign };
}

beforeEach(() => {
  model.prompts = [];
  model.failures = 0;
  model.reply = {
    title: "Orchard",
    markdown: `${allowed} [1]`,
    questions: [{ question: "How many crates?", choices: ["24", "12"], answerIndex: 0, explanation: allowed }],
    cards: [{ front: "How many crates?", back: allowed }],
    root: { label: "Orchard", children: [{ label: "24 crates" }] },
    items: [{ q: "How many crates?", a: allowed, title: "Harvest", date: "Not specified", text: allowed }],
    slides: [{ layout: "title", title: "Orchard" }, { layout: "bullets", title: "Harvest", bullets: [allowed] }, { layout: "closing", title: "Recap" }],
    sections: [{ title: "Harvest", heading: "Harvest", text: allowed, bullets: [allowed] }, { title: "Recap", heading: "Recap", text: allowed, bullets: [allowed] }],
    objectives: ["Describe the harvest"],
    scenes: Array.from({ length: 3 }, () => ({ title: "Harvest", headline: "Harvest", drawing: "Apple crates", narration: allowed })),
    turns: [{ speaker: "a", text: allowed }, { speaker: "b", text: allowed }],
  };
});

const routes = [
  ["report", generate], ["briefing", generate], ["study_guide", generate], ["faq", generate],
  ["quiz", generate], ["flashcards", generate], ["mindmap", generate], ["timeline", generate],
  ["slides", generate], ["infographic", generate], ["podcast", podcast],
  ["video", video], ["motion", motion], ["training", training],
] as const;

function submit(handler: typeof generate, nb: string, type: string, selection: unknown, topic?: string) {
  return handler(new Request("http://localhost/api/generation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notebookId: nb, type, length: "short", style: "classic", topic,
      ...(selection === undefined ? {} : { sourceIds: selection }) }),
  }));
}

describe("Library generation source boundaries", () => {
  it("does not suggest styles from a missing or cross-notebook selection", async () => {
    const { nb, selected, foreign } = seed();
    for (const selection of [undefined, [selected, foreign]]) {
      expect((await submit(suggestStyle, nb, "infographic", selection)).status).toBe(400);
    }
    expect(model.prompts).toHaveLength(0);
  });
  for (const [type, handler] of routes) {
    it(`${type} uses only selected source excerpts and saves their provenance`, async () => {
      const { nb, selected } = seed();
      const response = await submit(handler, nb, type, [selected], "orchard");
      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(model.prompts.length).toBeGreaterThan(0);
      for (const prompt of model.prompts) {
        const context = prompt.filter((m) => m.role === "user").map((m) => m.content).join("\n");
        expect(context).toContain(allowed);
        expect(context).not.toContain(unchecked);
        expect(context).not.toContain(outside);
        expect(context).not.toContain(note);
      }
      expect(body.content.sourceIds).toEqual([selected]);
      expect(body.content.citations.every((c: { sourceId: string }) => c.sourceId === selected)).toBe(true);
      const row = db.prepare("SELECT notebook_id, content FROM artifacts WHERE id = ?").get(body.id);
      expect(row?.notebook_id).toBe(nb);
      expect(JSON.parse(String(row?.content)).sourceIds).toEqual([selected]);
    });
  }

  for (const [type, handler] of routes.filter(([type]) => ["report", "podcast", "video", "motion", "training"].includes(type))) {
    for (const selection of [undefined, null, [], "not-an-array"]) {
      it(`${type} refuses ${JSON.stringify(selection)} instead of defaulting to all sources`, async () => {
        const { nb } = seed();
        const response = await submit(handler, nb, type, selection);
        expect(response.status).toBe(400);
        expect(model.prompts).toHaveLength(0);
        expect(db.prepare("SELECT COUNT(*) AS count FROM artifacts WHERE notebook_id = ?").get(nb)?.count).toBe(0);
      });
    }
    it(`${type} refuses a mixed selection containing another notebook's source`, async () => {
      const { nb, selected, foreign } = seed();
      const response = await submit(handler, nb, type, [selected, foreign]);
      expect(response.status).toBe(400);
      expect(model.prompts).toHaveLength(0);
    });
  }

  it("keeps the same boundary when generation retries with less context", async () => {
    const { nb, selected } = seed();
    model.failures = 1;
    const response = await submit(generate, nb, "report", [selected]);
    expect(response.status).toBe(200);
    expect(model.prompts).toHaveLength(2);
    for (const prompt of model.prompts) {
      expect(prompt[1].content).toContain(allowed);
      expect(prompt[1].content).not.toContain(unchecked);
    }
  });

  it("does not add notes to training research", async () => {
    const { nb, selected } = seed();
    expect((await researchPassages(nb, [selected], "", 30000)).map((p) => p.sourceId)).toEqual([selected]);
    expect(await researchPassages(nb, [], "", 30000)).toEqual([]);
  });

  it("ignores a chunk whose notebook disagrees with its source", async () => {
    const { nb, selected, foreign } = seed();
    db.prepare("INSERT INTO chunks (id, source_id, notebook_id, idx, text) VALUES (?,?,?,?,?)")
      .run(nanoid(12), foreign, nb, 1, outside);
    expect(sampleCorpus(nb, [selected, foreign]).map((p) => p.sourceId)).toEqual([selected]);
    expect((await retrieve(nb, "orchard", [selected, foreign])).map((p) => p.sourceId)).toEqual([selected]);
  });
});

function infographic(nb: string, sourceIds?: string[]) {
  const id = nanoid(12);
  db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)")
    .run(id, nb, "infographic", "Harvest", JSON.stringify({ title: "Harvest", sourceIds, sections: [] }), 1);
  return id;
}

describe("Training visual boundaries", () => {
  it("uses only the selected notebook source URLs for screenshot lookup", () => {
    const { nb, selected, unselected, foreign } = seed();
    for (const id of [selected, unselected, foreign]) {
      db.prepare("UPDATE sources SET url = ? WHERE id = ?").run(`https://learn.microsoft.com/en-us/${id}`, id);
    }
    expect(trainingSourcePages(nb, [selected, foreign])).toEqual([`https://learn.microsoft.com/en-us/${selected}`]);
    expect(trainingSourcePages(nb, [])).toEqual([]);
  });

  it("accepts a compatible infographic even when it is older than the planner's 20-item catalog", async () => {
    const { nb, selected } = seed();
    const compatible = infographic(nb, [selected]);
    db.prepare("UPDATE artifacts SET created_at = 0 WHERE id = ?").run(compatible);
    for (let i = 0; i < 20; i++) infographic(nb, [selected]);
    const id = nanoid(12);
    const sections = [{ title: "Harvest", text: allowed,
      cues: [{ kind: "infographic", anchor: "selected orchard", infographicId: compatible }] }];
    db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, nb, "training", "Harvest", JSON.stringify({ title: "Harvest", sourceIds: [selected], sections: [] }), 1);
    const response = await editTraining(new Request("http://localhost/api/training", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sections }),
    }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).content.sections[0].cues[0].infographicId).toBe(compatible);
  });

  it("rejects direct insertion of an infographic from outside the training selection", async () => {
    const { nb, selected, unselected } = seed();
    const unrelated = infographic(nb, [unselected]);
    const id = nanoid(12);
    const current = { title: "Harvest", objectives: [], sourceIds: [selected], sections: [{ title: "Harvest", text: allowed }] };
    db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, nb, "training", "Harvest", JSON.stringify(current), 1);
    const response = await editTraining(new Request("http://localhost/api/training", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sections: [{ title: "Harvest", text: allowed,
        cues: [{ kind: "infographic", anchor: "selected orchard", infographicId: unrelated }] }] }),
    }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    expect(JSON.parse(String(db.prepare("SELECT content FROM artifacts WHERE id = ?").get(id)?.content))).toEqual(current);
  });

  describe("Artifact provenance", () => {
    it("preserves legacy saved-source citations and unions contradictory IDs instead of hiding them", () => {
      expect(artifactSourceIds({ citations: [{ sourceId: "savedA" }] })).toEqual(["savedA"]);
      expect(artifactSourceIds({ sourceIds: ["savedA"], citations: [{ sourceId: "savedB" }] })).toEqual(["savedA", "savedB"]);
    });
    for (const content of [
      {}, { sourceIds: [] }, { sourceIds: ["note:external"] },
      { sourceIds: ["savedA"], citations: [{ sourceId: "note:external" }] },
      { sourceIds: ["savedA"], citations: [{ sourceId: "live", url: "https://example.com" }] },
      { sourceIds: ["savedA"], citations: [null] },
    ]) {
      it(`refuses unverified provenance ${JSON.stringify(content)}`, () => {
        expect(artifactSourceIds(content)).toEqual([]);
      });
    }
  });

  it("offers only infographics backed entirely by the training video's selected sources", () => {
    const { nb, selected, unselected } = seed();
    const compatible = infographic(nb, [selected]);
    infographic(nb, [unselected]);
    infographic(nb, [selected, unselected]);
    infographic(nb);
    expect(notebookInfographics(nb, [selected]).map((g) => g.id)).toEqual([compatible]);
  });

  it("filters the editor's infographic endpoint by the same boundary", async () => {
    const { nb, selected, unselected } = seed();
    const compatible = infographic(nb, [selected]);
    infographic(nb, [unselected]);
    const id = nanoid(12);
    db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, nb, "training", "Harvest", JSON.stringify({ sourceIds: [selected] }), 1);
    const response = await trainingInfographics(new Request("http://localhost/api/infographics"), { params: Promise.resolve({ id }) });
    expect((await response.json()).items.map((g: { id: string }) => g.id)).toEqual([compatible]);
  });

  it("grounds visual planning in the original selected sources, not just the editable script", async () => {
    const { nb, selected, unselected } = seed();
    const unrelated = infographic(nb, [unselected]);
    model.reply = { sections: [{ section: 1, cues: [{ kind: "stat", anchor: "selected orchard produced 24 crates", stat: { value: "24", label: "crates" } }] }] };
    await planTrainingVisuals(nb, {
      title: "Harvest", objectives: ["Describe the harvest"], sourceIds: [selected],
      sections: [{ title: "Harvest", text: `${allowed} ${unchecked}` }],
      composition: DEFAULT_COMPOSITION,
    });
    const context = model.prompts[0][1].content;
    expect(context).toContain("SOURCE EXCERPTS");
    expect(context).toContain(allowed);
    expect(model.prompts[0][0].content).not.toContain(unrelated);
  });
});
