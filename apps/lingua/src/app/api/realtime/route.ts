import { z } from "zod";
import { SetupSchema, resolveSetup } from "@/lib/setup";
import { startCall } from "@/lib/server/realtime";
import { error, fromError, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";

const Body = z.object({
  setup: SetupSchema,
  sdp: z
    .string()
    .min(10)
    .max(64 * 1024)
    .refine((v) => v.startsWith("v="), "Not an SDP offer."),
});

/** Start a realtime call: mint a client secret server-side and exchange SDP with the provider. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await readJson(req, 128 * 1024));
    if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid request.");
    const answer = await startCall(resolveSetup(parsed.data.setup), parsed.data.sdp);
    return json({ answer });
  } catch (e) {
    return fromError(e, "realtime");
  }
}
