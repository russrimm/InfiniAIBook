import fs from "node:fs";
import { NextResponse } from "next/server";
import { synthesizeDialogue, SpeechNotConfiguredError } from "@/lib/speech";
import { ALL_SPEAKERS, VOICE_PRESETS } from "@/lib/voices";
import { voiceDir, voicePreviewPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ name: string }> };

const sample = (name: string) =>
  `Hello, I'm ${name}. It's a pleasure to meet you!`;

/**
 * A short sample of one speaker, so a voice can be chosen by ear rather than
 * by name. Samples are fixed text per speaker, so the first request renders
 * them and every later one is served from disk.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { name } = await params;

  // Match case-insensitively but synthesise the canonical spelling: the
  // service substitutes a different voice for an unknown name rather than
  // failing, so an unchecked value would preview the wrong voice.
  const speaker = ALL_SPEAKERS.find((s) => s.toLowerCase() === name.toLowerCase());
  if (!speaker) {
    return NextResponse.json({ error: `Unknown speaker "${name}".` }, { status: 404 });
  }

  let file: string;
  try {
    file = voicePreviewPath(speaker);
  } catch {
    return NextResponse.json({ error: "Invalid speaker name." }, { status: 400 });
  }

  const headers = {
    "content-type": "audio/mpeg",
    "cache-control": "private, max-age=604800",
  };

  if (!fs.existsSync(file)) {
    try {
      const { audio } = await synthesizeDialogue(
        [{ speaker: "a", text: sample(speaker) }],
        { ...VOICE_PRESETS.conversational, a: speaker, b: speaker },
        1
      );
      fs.mkdirSync(voiceDir(), { recursive: true });
      fs.writeFileSync(file, audio);
    } catch (e) {
      const status = e instanceof SpeechNotConfiguredError ? 501 : 502;
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not render the sample." },
        { status }
      );
    }
  }

  const bytes = fs.readFileSync(file);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { ...headers, "content-length": String(bytes.length) },
  });
}
