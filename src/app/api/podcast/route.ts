import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatJSON, type ChatMsg } from "@/lib/ai";
import {
  buildContext,
  citationList,
  retrieve,
  sampleCorpus,
  type Passage,
} from "@/lib/retrieve";
import { GROUNDING_RULES, PODCAST_INSTRUCTION } from "@/lib/studio";
import { synthesizeDialogue, type Turn } from "@/lib/speech";
import { clampRate, resolveVoices, VOICE_PRESETS } from "@/lib/voices";
import { audioDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);
const MIN_CONTEXT_CHARS = 6000;

type Script = { title?: unknown; description?: unknown; turns?: unknown };

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Strip anything the model may have slipped in that a voice would read aloud. */
function cleanSpoken(text: string): string {
  return (
    text
      .replace(/\[\d+\](?:\[\d+\])*/g, "")
      .replace(/[*_`#>]/g, "")
      .replace(/\((?:https?:\/\/|www\.)[^)]*\)/gi, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/^\s*[-•]\s*/gm, "")
      .replace(/\s{2,}/g, " ")
      // Removing citation markers leaves gaps like "bacteria ." — close them up.
      .replace(/\s+([.,!?;:])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/** Keep speakers strictly alternating so the two voices never collide. */
function normalizeTurns(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const texts: string[] = [];
  for (const item of raw) {
    const o = item as { text?: unknown };
    const text = cleanSpoken(str(o.text));
    if (text) texts.push(text);
  }
  return texts.map((text, i) => ({ speaker: i % 2 === 0 ? "a" : "b", text }));
}

export async function POST(req: Request) {
  try {
    const { notebookId, topic, sourceIds, preset, voices: customVoices, rate } =
      (await req.json()) as {
        notebookId: string;
        topic?: string;
        sourceIds?: string[];
        preset?: keyof typeof VOICE_PRESETS;
        voices?: { a?: string; b?: string };
        rate?: number;
      };

    const focused = topic?.trim()
      ? await retrieve(notebookId, topic, sourceIds, 24)
      : [];

    const collect = (budget: number): Passage[] => {
      if (topic?.trim()) {
        const broad = sampleCorpus(notebookId, sourceIds, Math.round(budget * 0.4));
        const seen = new Set(focused.map((p) => p.id));
        return [...focused, ...broad.filter((p) => !seen.has(p.id))].slice(0, 45);
      }
      return sampleCorpus(notebookId, sourceIds, budget);
    };

    let budget = MAX_CONTEXT_CHARS;
    let passages = collect(budget);
    if (!passages.length) {
      return NextResponse.json(
        { error: "Add at least one source before generating an audio overview." },
        { status: 400 }
      );
    }

    let script: Script | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      const messages: ChatMsg[] = [
        {
          role: "system",
          content: `${GROUNDING_RULES}\n\n${PODCAST_INSTRUCTION(topic?.trim() ?? "")}`,
        },
        {
          role: "user",
          content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
        },
      ];
      try {
        script = await chatJSON<Script>(messages, 0.7);
        break;
      } catch (e) {
        lastError = e;
        const status = (e as { status?: number })?.status;
        if (status !== 429 || budget <= MIN_CONTEXT_CHARS) throw e;
        budget = Math.max(MIN_CONTEXT_CHARS, Math.floor(budget / 2));
        const next = collect(budget);
        if (!next.length) throw e;
        passages = next;
      }
    }
    if (!script) throw lastError;

    const turns = normalizeTurns(script.turns);
    if (turns.length < 2) {
      return NextResponse.json(
        { error: "The model did not return a usable dialogue. Try again." },
        { status: 502 }
      );
    }

    const voices = resolveVoices(preset, customVoices);
    const speed = clampRate(rate);
    const { audio, durationSec, offsets } = await synthesizeDialogue(
      turns,
      voices,
      speed
    );

    const id = nanoid(12);
    fs.mkdirSync(audioDir(), { recursive: true });
    fs.writeFileSync(path.join(audioDir(), `${id}.mp3`), audio);

    const content = {
      title: cleanSpoken(str(script.title, "Audio overview")).slice(0, 120),
      description: cleanSpoken(str(script.description)),
      turns: turns.map((t, i) => ({ ...t, at: Number(offsets[i].toFixed(2)) })),
      audioUrl: `/api/audio/${id}`,
      durationSec: Number(durationSec.toFixed(2)),
      voices: { a: voices.a, b: voices.b },
      rate: speed,
      citations: citationList(passages),
    };

    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, "podcast", content.title, JSON.stringify(content), Date.now());

    return ok({
      id,
      type: "podcast",
      title: content.title,
      content,
      createdAt: Date.now(),
    });
  } catch (e) {
    return fail(e);
  }
}
