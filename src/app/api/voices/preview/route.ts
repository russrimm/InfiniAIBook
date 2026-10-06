import { NextResponse } from "next/server";
import { SpeechNotConfiguredError } from "@/lib/speech";
import { loadVoiceCatalog, voiceSample } from "@/lib/voicelist";
import { cleanStyle, isVoiceId } from "@/lib/voicecatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A short sample of one voice, optionally in one style, so a voice can be
 * chosen by ear. Only voices and styles on the live list are rendered.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const voice = q.get("voice") ?? "";
  if (!isVoiceId(voice)) {
    return NextResponse.json({ error: "Unknown voice." }, { status: 400 });
  }
  const { voices } = await loadVoiceCatalog();
  const found = voices.find((v) => v.id === voice);
  if (!found) return NextResponse.json({ error: "Unknown voice." }, { status: 404 });
  const style = cleanStyle(q.get("style"));
  if (q.get("style") && (!style || !found.styles.includes(style))) {
    return NextResponse.json({ error: "That voice has no such style." }, { status: 400 });
  }

  try {
    const mp3 = await voiceSample(voice, style);
    return new NextResponse(new Uint8Array(mp3), {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(mp3.length),
        "cache-control": "private, max-age=604800",
      },
    });
  } catch (e) {
    const status = e instanceof SpeechNotConfiguredError ? 501 : 502;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not render the sample." },
      { status }
    );
  }
}
