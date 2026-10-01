import { NextResponse } from "next/server";
import { parseJSON, visionChat, type VisionMsg } from "@/lib/ai";
import { fail } from "@/lib/http";
import {
  MAX_FRAME_CHARS,
  SYSTEM_PROMPT,
  ScreenHelpRequestSchema,
  parseReply,
  trimHistory,
  turnPrompt,
} from "@/lib/screenhelp";
import { ImageNotReadError, assertReadsImages } from "@/lib/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** Frame plus history and goal; anything larger is not a screen-helper turn. */
const MAX_BODY_CHARS = MAX_FRAME_CHARS + 100_000;

/**
 * One turn of the screen helper: look at the shared screen and coach the user
 * toward their goal. Frames are sent to the vision model and never stored.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) {
      return NextResponse.json({ error: "The screenshot is too large." }, { status: 413 });
    }
    let json: unknown = null;
    try {
      json = JSON.parse(raw);
    } catch {
      // Reported by the schema below.
    }
    const parsed = ScreenHelpRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }
    const body = parsed.data;

    await assertReadsImages(body.frame);

    const messages: VisionMsg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...trimHistory(body.history).map((t) => ({ role: t.role, content: t.text }) as VisionMsg),
      {
        role: "user",
        content: [
          { type: "text", text: turnPrompt(body) },
          { type: "image_url", image_url: { url: body.frame, detail: "high" } },
        ],
      },
    ];

    const { text, model } = await visionChat(messages, {
      json: true,
      temperature: 0.2,
      signal: req.signal,
    });

    let data: unknown;
    try {
      data = parseJSON<unknown>(text);
    } catch {
      // A model that ignores the format still usually says something useful.
      data = { status: "answer", say: text };
    }
    const reply = parseReply(data, body.width, body.height);
    if (!reply.say && reply.status !== "unchanged") {
      return NextResponse.json({ error: `"${model}" returned an empty answer.` }, { status: 502 });
    }
    return NextResponse.json({ ...reply, model });
  } catch (e) {
    if (e instanceof ImageNotReadError) {
      return NextResponse.json({ error: e.message, code: "vision" }, { status: 400 });
    }
    return fail(e);
  }
}
