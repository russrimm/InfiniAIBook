import { NextResponse } from "next/server";
import { fail } from "./http";
import { RealtimeProviderError, RealtimeUnavailableError } from "./realtime";

/** Error responses for the live-discussion routes. */
export function discussionFail(e: unknown) {
  if (e instanceof RealtimeUnavailableError) {
    return NextResponse.json({ error: e.message, code: "realtime_unavailable" }, { status: 503 });
  }
  if (e instanceof RealtimeProviderError) {
    return NextResponse.json({ error: e.message, code: "realtime" }, { status: 502 });
  }
  if (e instanceof Error && e.name === "TimeoutError") {
    return NextResponse.json({ error: "The realtime service took too long to answer. Try again." }, { status: 504 });
  }
  return fail(e);
}
