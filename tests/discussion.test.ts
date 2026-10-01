import { afterEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  DiscussionSetupSchema,
  MODES,
  composeInstructions,
  discussionNote,
  numberExcerpts,
  parseDiscussionTool,
  quickActionsFor,
  scoreLine,
  type DiscussionCitation,
  type DiscussionSetup,
} from "@/lib/discussion";
import {
  discussionReducer,
  initialDiscussion,
  responseTools,
  savedTurns,
  usedCitations,
  type DiscussionAction,
  type DiscussionState,
  type RealtimeEvent,
} from "@/lib/discussionState";
import { buildDiscussionSession, openingExcerpts, searchForDiscussion } from "@/lib/discussionServer";
import { azureRealtimeOrigin, describeRealtimeError, startRealtimeCall } from "@/lib/realtime";

// Never reach for a real credential in tests.
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  authHeaders: async () => ({ "api-key": "test-key" }),
}));

const setup = (over: Partial<DiscussionSetup> = {}): DiscussionSetup =>
  DiscussionSetupSchema.parse({ mode: "discussion", ...over });

const cite = (n: number): DiscussionCitation => ({
  n,
  passageId: `p${n}`,
  sourceId: "s1",
  sourceTitle: "Annual report",
  part: n,
  snippet: `snippet ${n}`,
});

const T0 = 1_000_000;

function run(events: (RealtimeEvent | DiscussionAction)[], start?: DiscussionState): DiscussionState {
  let s = discussionReducer(start ?? initialDiscussion([cite(1), cite(2), cite(3)]), { type: "connected", now: T0 });
  let now = T0;
  for (const e of events) {
    now += 1000;
    const isAction = ["connected", "server", "tool", "excerpts", "reset"].includes(e.type);
    s = discussionReducer(s, isAction ? (e as DiscussionAction) : { type: "server", event: e as RealtimeEvent, now });
  }
  return s;
}

describe("composeInstructions", () => {
  const base = { notebookTitle: "Climate notes", sourceTitles: ["IPCC summary", "Field study"], overview: "[1] (source: \"IPCC summary\", part 1)\nWarming is 1.1°C." };

  it("grounds every mode in the excerpts and lists the sources", () => {
    for (const mode of Object.keys(MODES) as DiscussionSetup["mode"][]) {
      const text = composeInstructions({ ...base, setup: setup({ mode }) });
      expect(text).toContain("Warming is 1.1°C.");
      expect(text).toContain("- Field study");
      expect(text).toContain("call search_sources");
      expect(text).toContain(MODES[mode].role);
    }
  });

  it("states the debate motion, or asks the AI to propose one", () => {
    expect(composeInstructions({ ...base, setup: setup({ mode: "debate", stance: "Nuclear is essential" }) })).toContain(
      'the user argues "Nuclear is essential". You argue against it.'
    );
    expect(composeInstructions({ ...base, setup: setup({ mode: "debate" }) })).toContain("proposing a contested claim");
  });

  it("names the host after the voice and includes the focus", () => {
    const text = composeInstructions({ ...base, setup: setup({ voice: "cedar", focus: "sea level" }) });
    expect(text).toContain("You are Cedar,");
    expect(text).toContain("Concentrate on this focus: sea level.");
  });
});

describe("parseDiscussionTool", () => {
  it("validates each tool", () => {
    expect(parseDiscussionTool("search_sources", '{"query":"  sea level "}')).toEqual({
      name: "search_sources",
      args: { query: "sea level" },
    });
    expect(parseDiscussionTool("search_sources", '{"query":""}')).toBeNull();
    expect(parseDiscussionTool("cite_sources", '{"excerpts":[3,3,"2",-1,1.5]}')).toEqual({
      name: "cite_sources",
      args: { excerpts: [3, 2] },
    });
    expect(parseDiscussionTool("record_answer", '{"question":"q","verdict":"maybe"}')).toBeNull();
    expect(parseDiscussionTool("nope", "{}")).toBeNull();
    expect(parseDiscussionTool("cite_sources", "{bad")).toBeNull();
  });
});

describe("quick actions and score", () => {
  it("offers mode-specific actions", () => {
    expect(quickActionsFor("quiz").map((a) => a.id)).toContain("hint");
    expect(quickActionsFor("discussion").map((a) => a.id)).not.toContain("hint");
    expect(quickActionsFor("debate").map((a) => a.id)).toContain("rate");
  });

  it("scores half points for partly right", () => {
    expect(scoreLine([])).toBeNull();
    expect(
      scoreLine([
        { question: "a", verdict: "correct", feedback: "" },
        { question: "b", verdict: "partly", feedback: "" },
        { question: "c", verdict: "incorrect", feedback: "" },
      ])
    ).toBe("1.5 / 3");
  });
});

describe("discussionNote", () => {
  it("builds a titled note with score, answers and a cited transcript", () => {
    const { title, content } = discussionNote({
      setup: setup({ mode: "quiz", focus: "chapter 2", voice: "sage" }),
      turns: [
        { role: "assistant", text: "What is the warming so far?", cites: [] },
        { role: "user", text: "About one degree.", cites: [] },
        { role: "assistant", text: "Right, 1.1 degrees.", cites: [1] },
      ],
      results: [{ question: "Warming so far?", verdict: "correct", feedback: "Spot on." }],
      summary: "**Strong recall** of the headline figure [1].",
      durationSec: 125,
      date: new Date("2026-09-30T20:00:00Z"),
    });
    expect(title).toBe("🧠 Oral quiz: chapter 2");
    expect(content).toContain("*Live oral quiz with Sage · 2 min");
    expect(content).toContain("**Score:** 1 / 1");
    expect(content).toContain("## Takeaways\n\n**Strong recall**");
    expect(content).toContain("- ✅ **Warming so far?** Spot on.");
    expect(content).toContain("**Sage:** Right, 1.1 degrees. [1]");
    expect(content).toContain("**You:** About one degree.");
  });

  it("still saves the transcript without a summary", () => {
    const { content } = discussionNote({
      setup: setup(),
      turns: [{ role: "user", text: "Hello", cites: [] }],
      results: [],
      summary: null,
      durationSec: 20,
      date: new Date(),
    });
    expect(content).not.toContain("## Takeaways");
    expect(content).toContain("## Transcript");
  });
});

describe("discussionReducer", () => {
  it("keeps a late user transcription in order and attaches citations to the spoken line", () => {
    let s = run([
      { type: "input_audio_buffer.speech_started", item_id: "u1" },
      { type: "response.created" },
      { type: "response.output_audio_transcript.done", item_id: "a1", transcript: "The report says 1.1 degrees." },
      { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "How much warming?" },
    ]);
    s = discussionReducer(s, {
      type: "tool",
      callId: "c1",
      call: { name: "cite_sources", args: { excerpts: [1, 99] } },
      itemId: "a1",
    });
    expect(savedTurns(s)).toEqual([
      { role: "user", text: "How much warming?", cites: [] },
      { role: "assistant", text: "The report says 1.1 degrees.", cites: [1] },
    ]);
    expect(usedCitations(s).map((c) => c.n)).toEqual([1]);
  });

  it("carries citations from a tools-only response to the next spoken line", () => {
    let s = run([]);
    s = discussionReducer(s, { type: "tool", callId: "c1", call: { name: "cite_sources", args: { excerpts: [2] } }, itemId: null });
    s = run([{ type: "response.output_audio_transcript.done", item_id: "a2", transcript: "Here's what it says." }], s);
    expect(s.turns[0].cites).toEqual([2]);
    expect(s.pendingCites).toEqual([]);
  });

  it("shows typed messages and records verdicts against the answered turn", () => {
    let s = run([
      {
        type: "conversation.item.added",
        item: { id: "u1", type: "message", role: "user", content: [{ type: "input_text", text: "Paris" }] },
      },
      { type: "response.created" },
      { type: "input_audio_buffer.speech_started", item_id: "noise" },
    ]);
    s = discussionReducer(s, {
      type: "tool",
      callId: "r1",
      call: { name: "record_answer", args: { question: "Capital?", verdict: "correct", feedback: "Yes." } },
      itemId: null,
    });
    expect(s.turns[0]).toMatchObject({ text: "Paris", typed: true, pending: false });
    expect(s.results[0].turnId).toBe("u1");
    s = run([{ type: "conversation.item.input_audio_transcription.failed", item_id: "noise" }], s);
    expect(s.turns.map((t) => t.id)).toEqual(["u1"]);
    expect(s.results[0].turnId).toBe("u1");
  });

  it("adds searched excerpts once and notes the lookup", () => {
    const s = run([
      { type: "excerpts", citations: [cite(3), cite(4)], query: "sea level" },
    ]);
    expect(s.citations.map((c) => c.n)).toEqual([1, 2, 3, 4]);
    expect(s.notices[0].text).toBe("Looked up “sea level” · 2 passages");
  });

  it("only marks a line cut off when it was actually being spoken", () => {
    const s = run([
      { type: "output_audio_buffer.started" },
      { type: "response.output_audio_transcript.done", item_id: "a1", transcript: "First point." },
      { type: "output_audio_buffer.stopped" },
      { type: "response.done", response: { status: "completed", output: [{ type: "message", id: "a1" }] } },
      { type: "response.created" },
      { type: "input_audio_buffer.speech_started", item_id: "u2" },
    ]);
    expect(s.turns.find((t) => t.id === "a1")?.interrupted).toBeUndefined();
    const cut = run([
      { type: "output_audio_buffer.started" },
      { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "So the main" },
      { type: "input_audio_buffer.speech_started", item_id: "u2" },
    ]);
    expect(cut.turns[0].interrupted).toBe(true);
  });
});

describe("responseTools", () => {
  const fc = (name: string, args: unknown) => ({ type: "function_call", call_id: name, name, arguments: JSON.stringify(args) });

  it("always continues after a search, even if the AI already spoke", () => {
    const r = responseTools(
      {
        type: "response.done",
        response: { status: "completed", output: [{ type: "message", id: "a1" }, fc("search_sources", { query: "x" })] },
      },
      parseDiscussionTool
    );
    expect(r).toMatchObject({ hasSearch: true, needsResponse: true, messageId: "a1" });
  });

  it("continues after a tools-only response but not after speech, nor a cancelled one", () => {
    const only = { type: "response.done", response: { status: "completed", output: [fc("cite_sources", { excerpts: [1] })] } };
    expect(responseTools(only, parseDiscussionTool).needsResponse).toBe(true);
    const spoke = { type: "response.done", response: { status: "completed", output: [{ type: "message", id: "a" }, fc("cite_sources", { excerpts: [1] })] } };
    expect(responseTools(spoke, parseDiscussionTool).needsResponse).toBe(false);
    const cut = { type: "response.done", response: { status: "cancelled", output: [fc("search_sources", { query: "x" })] } };
    expect(responseTools(cut, parseDiscussionTool).needsResponse).toBe(false);
  });
});

describe("discussion server", () => {
  function seed() {
    const nb = nanoid(12);
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(nb, "Ocean", "📓", Date.now());
    const sid = nanoid(12);
    db.prepare(
      "INSERT INTO sources (id, notebook_id, title, kind, url, text, chars, created_at) VALUES (?,?,?,?,?,?,?,?)"
    ).run(sid, nb, "Tides report", "text", null, "t", 1, 1);
    const texts = [
      "Tides are driven by the moon's gravity.",
      "Coral reefs bleach when water warms.",
      "Sea level rose 20 centimeters last century.",
      "Kelp forests store carbon.",
    ];
    const chunkIds = texts.map((text, idx) => {
      const id = nanoid(12);
      db.prepare("INSERT INTO chunks (id, source_id, notebook_id, idx, text) VALUES (?,?,?,?,?)").run(id, sid, nb, idx, text);
      return id;
    });
    return { nb, sid, chunkIds };
  }

  it("puts focus passages first, within the budget", async () => {
    const { nb } = seed();
    const excerpts = await openingExcerpts(nb, undefined, "sea level rose", 1000);
    expect(excerpts[0].text).toContain("Sea level");
    expect(new Set(excerpts.map((e) => e.passageId)).size).toBe(excerpts.length);
    expect(excerpts.reduce((n, e) => n + e.text.length, 0)).toBeLessThanOrEqual(1000);
  });

  it("numbers new search results after the known ones and reuses known numbers", async () => {
    const { nb, chunkIds } = seed();
    const res = await searchForDiscussion({
      notebookId: nb,
      query: "coral reefs bleach warms",
      start: 5,
      known: [{ passageId: chunkIds[1], n: 2 }],
    });
    expect(res.output).toContain("excerpts you already have: [2]");
    expect(res.citations.every((c) => c.n >= 5)).toBe(true);
    expect(res.citations.some((c) => c.passageId === chunkIds[1])).toBe(false);
  });

  it("builds a semantic-VAD session with the voice, tools and numbered excerpts", () => {
    const excerpts = [{ passageId: "p", sourceId: "s", sourceTitle: "Tides report", idx: 0, text: "Tides are lunar." }];
    const { session, citations } = buildDiscussionSession({
      setup: setup({ mode: "quiz", voice: "ash" }),
      title: "Ocean",
      sources: ["Tides report"],
      excerpts,
      target: { baseUrl: "https://x/openai/v1", model: "gpt-realtime", transcription: "gpt-4o-mini-transcribe" },
    });
    expect(citations).toEqual(numberExcerpts(excerpts));
    expect(String(session.instructions)).toContain('[1] (source: "Tides report", part 1)\nTides are lunar.');
    expect(session).toMatchObject({
      audio: {
        output: { voice: "ash" },
        input: { turn_detection: { type: "semantic_vad", eagerness: "low" }, transcription: { model: "gpt-4o-mini-transcribe" } },
      },
    });
  });
});

describe("realtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps Foundry hosts to the openai.azure.com host", () => {
    expect(azureRealtimeOrigin("https://russ.services.ai.azure.com")).toBe("https://russ.openai.azure.com");
    expect(azureRealtimeOrigin("https://russ.cognitiveservices.azure.com")).toBe("https://russ.openai.azure.com");
    expect(azureRealtimeOrigin("https://russ.openai.azure.com")).toBe("https://russ.openai.azure.com");
    expect(azureRealtimeOrigin("https://gateway.example.com")).toBe("https://gateway.example.com");
  });

  it("mints a secret server-side, then exchanges SDP with it", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/client_secrets")) {
        const body = JSON.parse(init.body as string);
        expect(body.session).toMatchObject({ type: "realtime", model: "gpt-realtime-2.1", instructions: "x" });
        return new Response(JSON.stringify({ value: "ek_1" }), { status: 200 });
      }
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ek_1");
      return new Response("v=0\r\nanswer", { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const answer = await startRealtimeCall({ instructions: "x" }, "v=0\r\noffer", {
      baseUrl: "https://russ.openai.azure.com/openai/v1",
      model: "gpt-realtime-2.1",
      transcription: null,
    });
    expect(answer).toBe("v=0\r\nanswer");
    expect(fetchMock.mock.calls[0][0]).toBe("https://russ.openai.azure.com/openai/v1/realtime/client_secrets");
  });

  it("explains a deployment that isn't online yet", () => {
    expect(describeRealtimeError(400, '{"error":{"code":"OpperationNotSupported"}}')).toMatch(/wait about five minutes/);
    expect(describeRealtimeError(403, "no")).toMatch(/Cognitive Services OpenAI User/);
  });
});
