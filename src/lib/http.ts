import { NextResponse } from "next/server";
import { MissingConfigError, describeAuthError } from "./ai";

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(e: unknown) {
  if (e instanceof MissingConfigError) {
    return NextResponse.json({ error: e.message, code: "no_config" }, { status: 400 });
  }

  const status = (e as { status?: number })?.status;
  const described = describeAuthError(e);
  if (described) {
    if (status === 429) {
      return NextResponse.json(
        { error: described, code: "rate_limit" },
        { status: 429 }
      );
    }
    if (status === 404) {
      return NextResponse.json({ error: described, code: "config" }, { status: 502 });
    }
    return NextResponse.json({ error: described, code: "auth" }, { status: 401 });
  }

  const msg = e instanceof Error ? e.message : "Unexpected error";
  console.error("[api]", e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export function nowMs() {
  return Date.now();
}
