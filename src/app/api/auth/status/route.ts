import { NextResponse } from "next/server";
import { authPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether sign-in is enabled, so the UI knows to offer Sign out. */
export async function GET() {
  return NextResponse.json({ auth: authPassword() !== null });
}
