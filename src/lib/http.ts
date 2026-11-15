import { NextResponse } from "next/server";
import { BudgetExceededError } from "./budget";
import { MissingConfigError, describeAuthError, isConnectionError } from "./ai";
import { db } from "./db";
import { SourceBoundaryError } from "./artifactsources";

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(e: unknown) {
  if (e instanceof SourceBoundaryError) {
    return NextResponse.json({ error: e.message, code: "invalid_sources" }, { status: 400 });
  }
  if (e instanceof BudgetExceededError) {
    return NextResponse.json({ error: e.message, code: "budget" }, { status: 429 });
  }
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
    if (status === 404 || isConnectionError(e)) {
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

/**
 * 400 for an explicit empty source selection. Omitting `sourceIds` still means
 * every source, for API callers; an empty list is a UI with nothing ticked.
 */
export function noSourcesSelected(sourceIds: unknown): NextResponse | null {
  if (Array.isArray(sourceIds) && sourceIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one source.", code: "no_sources" },
      { status: 400 }
    );
  }

  return null;
}

/** Generation never expands a missing, stale, or cross-notebook selection. */
export function generationSourceError(notebookId: unknown, sourceIds: unknown): NextResponse | null {
  if (typeof notebookId !== "string" || !notebookId.trim()) {
    return NextResponse.json({ error: "notebookId is required.", code: "invalid" }, { status: 400 });
  }
  if (!Array.isArray(sourceIds) || !sourceIds.length) {
    return NextResponse.json(
      { error: "Provide a nonempty sourceIds list of selected sources.", code: "no_sources" },
      { status: 400 }
    );
  }
  if (sourceIds.some((id) => typeof id !== "string" || !id.trim())) {
    return NextResponse.json({ error: "sourceIds must be a list of source ids.", code: "invalid" }, { status: 400 });
  }
  const live = new Set(
    db.prepare("SELECT id FROM sources WHERE notebook_id = ?").all(notebookId).map((row) => String(row.id))
  );
  if (sourceIds.some((id) => !live.has(id))) {
    return NextResponse.json(
      { error: "Every selected source must belong to this notebook. Refresh the source selection.", code: "invalid_sources" },
      { status: 400 }
    );
  }
  return null;
}
