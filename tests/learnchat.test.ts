import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, floatsToBlob } from "@/lib/db";
import { retrieveChatContext } from "@/lib/learnchat";
import { buildContext, citationList } from "@/lib/retrieve";
import { POST } from "@/app/api/chat/route";
import { LearnError } from "@/lib/learn";
import { exportNotebookZip, importNotebookZip } from "@/lib/notebookpack";
import { listSessions, sessionMessages } from "@/lib/sessions";

const mocks = vi.hoisted(() => ({ searchLearn: vi.fn(), chatStream: vi.fn() }));
vi.mock("@/lib/learn", async (original) => ({
  ...await original<typeof import("@/lib/learn")>(), searchLearn: mocks.searchLearn,
}));
vi.mock("@/lib/ai", async (original) => ({
  ...await original<typeof import("@/lib/ai")>(),
  embed: vi.fn(async () => [[1, 0, 0]]),
  chatStream: mocks.chatStream,
}));

const id = "live-learn-nb";
const url = "https://learn.microsoft.com/en-us/azure/overview";
const excerpt = "Azure provides cloud services with documented capabilities.";
const submit = (body: Record<string, unknown> = {}) => POST(new Request("http://localhost/api/chat", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ notebookId: id, message: "What is Azure?", sourceIds: [], ...body }),
}));

beforeEach(() => {
  db.prepare("DELETE FROM notebooks").run();
  db.prepare("INSERT INTO notebooks (id,title,emoji,created_at,live_learn) VALUES (?,?,?,?,?)")
    .run(id, "Live docs", "L", 1, 1);
  for (const [sourceId, text] of [["chosen", "Selected local Azure information."], ["hidden", "Do not include this secret local source."]]) {
    db.prepare("INSERT INTO sources (id,notebook_id,title,kind,text,chars,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(sourceId, id, sourceId, "text", text, text.length, 1);
    db.prepare("INSERT INTO chunks (id,source_id,notebook_id,idx,text) VALUES (?,?,?,?,?)")
      .run("chunk-" + sourceId, sourceId, id, 0, text);
  }
  mocks.searchLearn.mockResolvedValue([{ title: "Azure overview", url, content: excerpt }]);
  mocks.chatStream.mockImplementation(async () => (async function* () {
    yield { choices: [{ delta: { content: "Azure offers cloud services [1]." } }] };
  })());
});
afterEach(() => vi.clearAllMocks());

describe("live Learn chat context", () => {
  it("uses only Learn when no stored sources are selected", async () => {
    const result = await retrieveChatContext(id, "What is Azure?", []);
    expect(result.passages).toHaveLength(1);
    expect(result.passages[0]).toMatchObject({ url, text: excerpt });
    expect(buildContext(result.passages)).toContain("Microsoft Learn");
    expect(buildContext(result.passages)).toContain(url);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sources").get()).toMatchObject({ n: 2 });
  });

  it("combines Learn with only the explicitly selected local sources", async () => {
    const result = await retrieveChatContext(id, "Azure", ["chosen"]);
    expect(result.passages.map((p) => p.text)).toEqual(["Selected local Azure information.", excerpt]);
  });

  it("does not call Learn when the saved setting is off", async () => {
    db.prepare("UPDATE notebooks SET live_learn=0 WHERE id=?").run(id);
    const result = await retrieveChatContext(id, "Azure", ["chosen"]);
    expect(result.passages.map((p) => p.sourceId)).toEqual(["chosen"]);
    expect(mocks.searchLearn).not.toHaveBeenCalled();
  });

  it("does not silently answer locally when the enabled live connection fails", async () => {
    mocks.searchLearn.mockRejectedValue(new LearnError("Microsoft Learn is unavailable."));
    await expect(retrieveChatContext(id, "Azure", ["chosen"])).rejects.toThrow(/Microsoft Learn/);
  });

  it("shows a notice if Learn has no matches but local sources can answer", async () => {
    mocks.searchLearn.mockResolvedValue([]);
    const result = await retrieveChatContext(id, "Azure", ["chosen"]);
    expect(result.passages).toHaveLength(1);
    expect(result.notice).toMatch(/no match/i);
  });

  it("bounds live excerpts and preserves their complete cited text", async () => {
    mocks.searchLearn.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({
      title: `Page ${i}`, url: `${url}/${i}`, content: "A".repeat(9000),
    })));
    const result = await retrieveChatContext(id, "Azure", []);
    expect(result.passages).toHaveLength(6);
    expect(result.passages.every((p) => p.text.length <= 4000)).toBe(true);
    expect(citationList(result.passages)[0]).toMatchObject({ url: `${url}/0`, content: result.passages[0].text });
  });
});

describe("live Learn chat API", () => {
  it("streams a grounded answer with live sources alone and saves its citation snapshot", async () => {
    const response = await submit();
    expect(response.status).toBe(200);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    const done = events.find((event) => event.type === "done");
    expect(done?.citations).toMatchObject([{ url, content: excerpt }]);
    const row = db.prepare("SELECT citations FROM messages WHERE role='assistant'").get() as { citations: string };
    expect(JSON.parse(row.citations)).toMatchObject([{ url, content: excerpt }]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sources").get()).toMatchObject({ n: 2 });

    const pack = await exportNotebookZip(id);
    const imported = await importNotebookZip(pack!.buffer);
    const restored = sessionMessages(listSessions(imported.id)[0].id).find((m) => m.role === "assistant");
    expect(restored?.citations).toMatchObject([{ url, content: excerpt }]);
  });

  it("still rejects an empty selection when saved live mode is off", async () => {
    db.prepare("UPDATE notebooks SET live_learn=0 WHERE id=?").run(id);
    const response = await submit({ liveLearn: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "no_sources" });
    expect(mocks.searchLearn).not.toHaveBeenCalled();
  });

  it("reports Learn lookup failures instead of starting an ungrounded answer", async () => {
    mocks.searchLearn.mockRejectedValue(new LearnError("Microsoft Learn returned HTTP 429."));
    const response = await submit();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "learn_unavailable", error: expect.stringMatching(/429/) });
    expect(db.prepare("SELECT COUNT(*) AS n FROM messages").get()).toMatchObject({ n: 0 });
  });

  it("explains zero live matches rather than claiming the notebook needs a saved source", async () => {
    mocks.searchLearn.mockResolvedValue([]);
    const response = await submit();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/Microsoft Learn.*no match/i) });
  });

  it("keeps the no-Learn-matches and stale-embedding explanations in one notice", async () => {
    mocks.searchLearn.mockResolvedValue([]);
    db.prepare("UPDATE chunks SET embedding=?, embed_model=?, embed_dims=? WHERE source_id=?")
      .run(floatsToBlob([1, 0, 0]), "older-model", 3, "chosen");
    const response = await submit({ sourceIds: ["chosen"] });
    expect(response.status).toBe(200);
    const notices = (await response.text()).trim().split("\n")
      .map((line) => JSON.parse(line)).filter((event) => event.type === "notice");
    expect(notices).toHaveLength(1);
    expect(notices[0].notice).toMatch(/Microsoft Learn found no matches/);
    expect(notices[0].notice).toMatch(/older-model/);
  });
});
