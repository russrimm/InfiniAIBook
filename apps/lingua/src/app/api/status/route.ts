import { chatModel, provider, realtimeModel, transcriptionModel } from "@/lib/server/provider";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What is configured, so the setup screen can explain anything missing before a call. */
export async function GET() {
  const problems: string[] = [];
  let kind: string | null = null;
  try {
    kind = provider().kind;
  } catch (e) {
    problems.push((e as Error).message);
  }
  let realtime: string | null = null;
  try {
    realtime = realtimeModel();
  } catch (e) {
    problems.push((e as Error).message);
  }
  return json({
    provider: kind,
    realtime,
    transcription: transcriptionModel(),
    chat: chatModel(),
    ready: problems.length === 0,
    problems,
  });
}
