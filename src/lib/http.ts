import { NextResponse } from "next/server";
import { MissingConfigError } from "./ai";

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(e: unknown) {
  if (e instanceof MissingConfigError) {
    return NextResponse.json({ error: e.message, code: "no_config" }, { status: 400 });
  }
  const msg = e instanceof Error ? e.message : "Unexpected error";
  console.error("[api]", e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export function nowMs() {
  return Date.now();
}
