import fs from "node:fs";
import { nanoid } from "nanoid";
import { db } from "./db";
import { reserve } from "./budget";
import { clipPath, removeClips } from "./paths";
import type { ClipContent, ClipItem, ClipStage, Citation } from "./types";
import { clipCents, estimateClipCost, type ClipRequest, type VideoProvider } from "./videoclip";
import { clipLimits, runClip } from "./videoclipjob";
import { VideoClipError } from "./videoclip";
import { currentVideoProvider } from "./videoproviders";

/**
 * Studio "Video clip" artifacts.
 *
 * A run is stored the moment it starts and then worked in the background, like
 * the other long builds: the browser polls the artifact for progress, and
 * closing the tab does not stop it. Each clip is independent, so one that fails
 * or is refused does not take the others with it.
 */

type Running = { abort: AbortController };
const g = globalThis as unknown as { __clipRuns?: Map<string, Running> };
const runs = (g.__clipRuns ??= new Map<string, Running>());

export const isClipRunning = (id: string): boolean => runs.has(id);

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function summarize(items: ClipItem[], cancelled: boolean): ClipContent["progress"] {
  const done = items.filter((c) => c.status === "completed").length;
  const failed = items.filter((c) => c.status === "failed").length;
  const open = items.some((c) => !TERMINAL.has(c.status));
  const stage: ClipStage = open
    ? "generating"
    : done === items.length
      ? "done"
      : done > 0
        ? "partial"
        : cancelled
          ? "cancelled"
          : "failed";
  return { stage, done, failed, total: items.length };
}

function save(id: string, content: ClipContent) {
  db.prepare("UPDATE artifacts SET content = ? WHERE id = ?").run(JSON.stringify(content), id);
}

const titleFrom = (prompt: string): string => {
  const words = prompt.replace(/\s+/g, " ").trim();
  return words.length > 60 ? `${words.slice(0, 57).trimEnd()}…` : words;
};

export type StartClipRun = {
  notebookId: string;
  request: ClipRequest;
  provider: VideoProvider;
  title?: string;
  sourceIds: string[];
  citations: Citation[];
};

/** Create the artifact and start generating. Returns at once; the work continues in the background. */
export function startClipRun(args: StartClipRun) {
  const { request, provider } = args;
  const caps = provider.capabilities();
  const id = nanoid(12);
  const now = Date.now();

  const clips: ClipItem[] = [];
  request.prompts.forEach((prompt, p) => {
    for (let v = 1; v <= request.variants; v++) {
      clips.push({ index: p * request.variants + (v - 1), prompt, variant: v, status: "queued" });
    }
  });

  const cost = estimateClipCost(caps, request);
  const title = args.title?.trim() || (request.prompts.length === 1 ? titleFrom(request.prompts[0]) : `${request.prompts.length} video clips`);
  const content: ClipContent & { sourceIds: string[]; citations: Citation[] } = {
    title,
    provider: { kind: caps.kind, label: caps.label, model: caps.model },
    options: {
      aspect: request.aspect,
      duration: request.duration,
      resolution: request.resolution,
      variants: request.variants,
      ...(request.reference ? { reference: true } : {}),
    },
    clips,
    progress: summarize(clips, false),
    estimate: { usd: cost.totalUsd, seconds: cost.secondsTotal, priceNote: caps.priceNote },
    createdAt: now,
    sourceIds: [...new Set(args.sourceIds)],
    citations: args.citations,
  };

  db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)").run(
    id,
    args.notebookId,
    "clip",
    title,
    JSON.stringify(content),
    now,
  );

  const abort = new AbortController();
  runs.set(id, { abort });
  void work(id, content, request, provider, abort).catch((e) => {
    console.warn(`[videoclip] run ${id} stopped unexpectedly: ${e instanceof Error ? e.message : String(e)}`);
  });

  return { id, notebookId: args.notebookId, type: "clip" as const, title, content, createdAt: now };
}

async function work(
  id: string,
  content: ClipContent,
  request: ClipRequest,
  provider: VideoProvider,
  abort: AbortController,
) {
  const caps = provider.capabilities();
  const limits = clipLimits();
  const cents = clipCents(caps, request.duration, request.resolution);

  // Writing the row for every tick would be a lot of JSON for a status line.
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = (force = false) => {
    content.progress = summarize(content.clips, abort.signal.aborted);
    const t = Date.now();
    if (force || t - last >= 1_000) {
      clearTimeout(timer);
      timer = undefined;
      last = t;
      save(id, content);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = undefined;
        last = Date.now();
        save(id, content);
      }, 1_000 - (t - last));
    }
  };

  const queue = [...content.clips];
  const lane = async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      if (abort.signal.aborted) {
        item.status = "cancelled";
        persist();
        continue;
      }
      try {
        const result = await runClip({
          provider,
          request,
          prompt: item.prompt,
          dest: clipPath(id, item.index, "mp4"),
          posterDest: clipPath(id, item.index, "jpg"),
          signal: abort.signal,
          reserve: () => reserve("video", cents),
          onUpdate: (p) => {
            item.status = p.status;
            if (p.progress !== undefined) item.progress = p.progress;
            if (p.remoteId) item.remoteId = p.remoteId;
            item.note = p.message;
            persist();
          },
        });
        item.status = "completed";
        item.progress = 100;
        item.note = undefined;
        item.remoteId = result.remoteId;
        item.bytes = result.bytes;
        item.videoUrl = `/api/videoclip/${id}/${item.index}`;
        if (result.poster && fs.existsSync(clipPath(id, item.index, "jpg"))) {
          item.posterUrl = `/api/videoclip/${id}/${item.index}/poster`;
        }
      } catch (e) {
        const err = e instanceof VideoClipError ? e : new VideoClipError(e instanceof Error ? e.message : String(e));
        item.note = undefined;
        if (err.detail.cancelled) {
          item.status = "cancelled";
        } else {
          item.status = "failed";
          item.error = err.message;
          if (err.detail.moderation) item.moderation = true;
        }
      }
      persist(true);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(limits.concurrency, content.clips.length) }, lane));
  } finally {
    clearTimeout(timer);
    runs.delete(id);
    content.progress = summarize(content.clips, abort.signal.aborted);
    save(id, content);
  }
}

/** Stop a run. Clips already finished are kept. Returns false when nothing was running. */
export function cancelClipRun(id: string): boolean {
  const run = runs.get(id);
  if (!run) return false;
  run.abort.abort();
  return true;
}

/**
 * A run whose process died keeps saying "generating" forever. Called when the
 * artifact is read, so the list heals itself instead of spinning.
 */
export function reconcileStalledClip(id: string) {
  if (runs.has(id)) return;
  const row = db.prepare("SELECT type, content FROM artifacts WHERE id = ?").get(id) as unknown as
    | { type: string; content: string }
    | undefined;
  if (row?.type !== "clip") return;
  let content: ClipContent;
  try {
    content = JSON.parse(row.content) as ClipContent;
  } catch {
    return;
  }
  if (content.progress?.stage !== "generating") return;
  for (const c of content.clips) {
    if (!TERMINAL.has(c.status)) {
      c.status = "failed";
      c.note = undefined;
      c.error =
        "The app restarted while this clip was being made, so it was lost. The provider may still have billed for it; generate it again if you need it.";
    }
  }
  content.progress = summarize(content.clips, false);
  save(id, content);
}

/** Delete a clip artifact's files, and its remote assets where the provider can. */
export function forgetClips(id: string, rawContent?: string) {
  cancelClipRun(id);
  removeClips(id);
  if (!rawContent) return;
  try {
    const content = JSON.parse(rawContent) as ClipContent;
    const provider = currentVideoProvider();
    // Only the provider that made a clip can delete it.
    if (!provider || provider.capabilities().kind !== content.provider?.kind || !provider.remove) return;
    for (const c of content.clips ?? []) {
      if (c.remoteId) void provider.remove(c.remoteId).catch(() => {});
    }
  } catch {
    /* an unreadable body has nothing to clean up remotely */
  }
}
