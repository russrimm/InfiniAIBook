import { NextResponse } from "next/server";
import { loadVoiceCatalog } from "@/lib/voicelist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Voices (and the styles each supports) the Speech resource offers for presenters. */
export async function GET() {
  const { voices, live } = await loadVoiceCatalog();
  return NextResponse.json({ voices, live });
}
