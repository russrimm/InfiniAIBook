import { describe, expect, it } from "vitest";
import {
  conversationReducer,
  initialConversation,
  toTranscript,
  toolFollowUp,
  type Action,
  type ConversationState,
  type ServerEvent,
} from "@/lib/conversation";
import { parseToolCall } from "@/lib/tools";

const T0 = 1_000_000;

function run(events: (ServerEvent | Action)[], start = initialConversation("es", "en")): ConversationState {
  let s = conversationReducer(start, { type: "connected", now: T0 });
  let now = T0;
  for (const e of events) {
    now += 1000;
    const action: Action = "type" in e && ["connected", "server", "tools", "gloss", "notice"].includes(e.type)
      ? (e as Action)
      : { type: "server", event: e as ServerEvent, now };
    s = conversationReducer(s, action);
  }
  return s;
}

const fc = (call_id: string, name: string, args: unknown) => ({
  type: "function_call",
  call_id,
  name,
  arguments: JSON.stringify(args),
});

describe("conversationReducer", () => {
  it("keeps a learner line in place when its transcript arrives after the reply", () => {
    const s = run([
      { type: "input_audio_buffer.speech_started", item_id: "u1" },
      { type: "input_audio_buffer.speech_stopped", item_id: "u1" },
      { type: "response.created" },
      { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "¡Hola! " },
      { type: "response.output_audio_transcript.done", item_id: "a1", transcript: "¡Hola! ¿Qué tal?" },
      { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "Hola, buenos días" },
      { type: "response.done", response: { status: "completed", output: [{ type: "message" }] } },
    ]);
    expect(s.turns.map((t) => [t.role, t.text])).toEqual([
      ["learner", "Hola, buenos días"],
      ["partner", "¡Hola! ¿Qué tal?"],
    ]);
    expect(s.turns[0].lang).toBe("es");
    expect(s.turns[0].at).toBe(1000);
    expect(s.responseActive).toBe(false);
  });

  it("drops a learner line that transcribed to nothing", () => {
    const s = run([
      { type: "input_audio_buffer.speech_started", item_id: "u1" },
      { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "  " },
    ]);
    expect(s.turns).toEqual([]);
  });

  it("marks the partner as cut off when the learner barges in", () => {
    const s = run([
      { type: "response.created" },
      { type: "output_audio_buffer.started" },
      { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "Bueno, pues te cuento que" },
      { type: "input_audio_buffer.speech_started", item_id: "u2" },
    ]);
    expect(s.turns[0]).toMatchObject({ role: "partner", interrupted: true });
    expect(s.turns[1]).toMatchObject({ role: "learner", pending: true });
  });

  it("closes partner lines on response.done and drops empty ones", () => {
    const s = run([
      { type: "response.created" },
      { type: "response.output_item.added", item: { id: "a1", type: "message", role: "assistant" } },
      { type: "response.output_item.added", item: { id: "a2", type: "message", role: "assistant" } },
      { type: "response.output_audio_transcript.delta", item_id: "a2", delta: "Vale " },
      { type: "response.done", response: { status: "cancelled", output: [] } },
    ]);
    expect(s.turns).toHaveLength(1);
    expect(s.turns[0]).toMatchObject({ id: "a2", text: "Vale", pending: false });
  });

  it("applies tool calls once, attaching corrections to the latest learner line", () => {
    const base = run([
      { type: "input_audio_buffer.speech_started", item_id: "u1" },
      { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "Yo es Sam" },
    ]);
    const calls = [
      { callId: "c1", call: parseToolCall("log_correction", JSON.stringify({ learner_said: "Yo es", corrected: "Yo soy", explanation: "ser: yo soy", category: "conjugation" }))! },
      { callId: "c2", call: parseToolCall("set_language_mode", JSON.stringify({ mode: "support", reason: "learner asked" }))! },
      { callId: "c3", call: parseToolCall("log_vocabulary", JSON.stringify({ term: "encantado", translation: "nice to meet you" }))! },
      { callId: "c4", call: parseToolCall("scenario_progress", JSON.stringify({ goal_id: "greet" }))! },
    ];
    let s = conversationReducer(base, { type: "tools", calls });
    s = conversationReducer(s, { type: "tools", calls });
    expect(s.corrections).toHaveLength(1);
    expect(s.corrections[0]).toMatchObject({ turnId: "u1", corrected: "Yo soy" });
    expect(s.languageMode).toBe("support");
    expect(s.notices[0].text).toBe("Switched to English · learner asked");
    expect(s.vocabulary).toHaveLength(1);
    expect(s.goalsDone).toEqual(["greet"]);
  });
});

describe("review regressions", () => {
  const correction = (id: string) => ({
    callId: id,
    call: parseToolCall(
      "log_correction",
      JSON.stringify({ learner_said: "j'ai acheter", corrected: "j'ai acheté", explanation: "participle", category: "conjugation" })
    )!,
  });

  it("attaches a correction to the turn being answered, even after a barge-in that turns out empty", () => {
    let s = run(
      [
        { type: "input_audio_buffer.speech_started", item_id: "L1" },
        { type: "conversation.item.input_audio_transcription.completed", item_id: "L1", transcript: "Hier j'ai acheter un pull" },
        { type: "response.created" },
        { type: "response.output_audio_transcript.delta", item_id: "P1", delta: "Ah, tu as " },
        { type: "input_audio_buffer.speech_started", item_id: "LX" },
        { type: "response.done", response: { status: "cancelled", output: [] } },
      ],
      initialConversation("fr", "en")
    );
    s = conversationReducer(s, { type: "tools", calls: [correction("c1")] });
    expect(s.corrections[0].turnId).toBe("L1");
    s = run(
      [
        { type: "conversation.item.input_audio_transcription.completed", item_id: "LX", transcript: "" },
        { type: "response.created" },
        { type: "response.output_audio_transcript.done", item_id: "P2", transcript: "Tu as acheté quoi ?" },
      ],
      s
    );
    const t = toTranscript(s, T0 + 10_000, true);
    const idx = t.corrections[0].turnIndex!;
    expect(t.turns[idx]).toMatchObject({ role: "learner", text: "Hier j'ai acheter un pull" });
  });

  it("does not mark a finished partner line as cut off when a pending response has not spoken yet", () => {
    const s = run([
      { type: "response.created" },
      { type: "output_audio_buffer.started" },
      { type: "response.output_audio_transcript.done", item_id: "P0", transcript: "¿Y tú?" },
      { type: "output_audio_buffer.stopped" },
      { type: "response.done", response: { status: "completed", output: [{ type: "message" }] } },
      { type: "input_audio_buffer.speech_started", item_id: "L1" },
      { type: "response.created" },
      { type: "input_audio_buffer.speech_started", item_id: "L2" },
    ]);
    expect(s.turns.find((t) => t.id === "P0")?.interrupted).toBeUndefined();
  });

  it("moves a notice off a dropped turn", () => {
    let s = run([
      { type: "input_audio_buffer.speech_started", item_id: "L1" },
      { type: "conversation.item.input_audio_transcription.completed", item_id: "L1", transcript: "Hola" },
      { type: "input_audio_buffer.speech_started", item_id: "LX" },
    ]);
    s = conversationReducer(s, { type: "notice", text: "note", kind: "info" });
    expect(s.notices[0].afterTurnId).toBe("LX");
    s = run([{ type: "conversation.item.input_audio_transcription.failed", item_id: "LX" }], s);
    expect(s.notices[0].afterTurnId).toBe("L1");
  });
});

describe("toolFollowUp", () => {
  it("asks for a spoken reply after a tools-only response", () => {
    const f = toolFollowUp({
      type: "response.done",
      response: { status: "completed", output: [fc("c1", "set_language_mode", { mode: "support", reason: "x" })] },
    });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].call?.name).toBe("set_language_mode");
    expect(f.needsResponse).toBe(true);
  });

  it("does not when the partner already spoke or was interrupted", () => {
    const spoke = toolFollowUp({
      type: "response.done",
      response: { status: "completed", output: [{ type: "message" }, fc("c1", "log_vocabulary", { term: "a", translation: "b" })] },
    });
    expect(spoke.needsResponse).toBe(false);
    const cut = toolFollowUp({
      type: "response.done",
      response: { status: "cancelled", output: [fc("c1", "log_vocabulary", { term: "a", translation: "b" })] },
    });
    expect(cut.needsResponse).toBe(false);
  });

  it("keeps malformed calls so they still get an output, but unparsed", () => {
    const f = toolFollowUp({
      type: "response.done",
      response: { status: "completed", output: [{ type: "message" }, { type: "function_call", call_id: "x", name: "log_correction", arguments: "{oops" }] },
    });
    expect(f.calls[0].call).toBeNull();
  });
});

describe("toTranscript", () => {
  it("keeps finished lines and remaps correction indexes", () => {
    let s = run([
      { type: "input_audio_buffer.speech_started", item_id: "u0" },
      { type: "response.output_audio_transcript.done", item_id: "a1", transcript: "¿Qué quieres?" },
      { type: "input_audio_buffer.speech_started", item_id: "u1" },
      { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "Quiero un cafe" },
    ]);
    s = conversationReducer(s, {
      type: "tools",
      calls: [{ callId: "c", call: parseToolCall("log_correction", JSON.stringify({ learner_said: "cafe", corrected: "café", explanation: "accent", category: "other" }))! }],
    });
    expect(s.corrections[0].turnId).toBe("u1");
    const t = toTranscript(s, T0 + 65_000, true);
    expect(t.turns.map((x) => x.text)).toEqual(["¿Qué quieres?", "Quiero un cafe"]);
    expect(t.corrections[0].turnIndex).toBe(1);
    expect(t.durationSec).toBe(65);
    expect(t.ended).toBe(true);
  });
});

describe("parseToolCall", () => {
  it("rejects bad modes, empty corrections and no-op corrections", () => {
    expect(parseToolCall("set_language_mode", '{"mode":"klingon"}')).toBeNull();
    expect(parseToolCall("log_correction", '{"learner_said":"a","corrected":"a"}')).toBeNull();
    expect(parseToolCall("log_vocabulary", '{"term":"x"}')).toBeNull();
    expect(parseToolCall("unknown", "{}")).toBeNull();
  });

  it("defaults an unknown correction category to other", () => {
    expect(parseToolCall("log_correction", '{"learner_said":"a","corrected":"b","category":"vibes"}')).toMatchObject({
      args: { category: "other" },
    });
  });
});
