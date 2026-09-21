import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import { generateImage } from "./ai";
import { synthesizeRawSsml } from "./speech";
import { addBreaths } from "./prosody";
import { videoDir, videoPath, videoWorkDir } from "./paths";
import { HAND_PROMPT, scenePrompt, type Scene, type ScenePlan } from "./whiteboard";

export type VideoStage =
  | "planning"
  | "artwork"
  | "narration"
  | "rendering"
  | "done"
  | "failed";

export type VideoProgress = {
  stage: VideoStage;
  done: number;
  total: number;
  note?: string;
};

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Progress lives on the artifact row, so polling the notebook shows it.
 *
 * Every write stamps a heartbeat. A build runs in this process, so anything
 * that kills the process — a restart, a crash — leaves the row frozen
 * mid-stage with no way for the client to tell it apart from slow work. The
 * heartbeat is what `reconcileStalledVideos` uses to tell the two apart.
 */
export function setProgress(id: string, patch: Partial<Record<string, unknown>>) {
  const row = db.prepare("SELECT content FROM artifacts WHERE id = ?").get(id) as
    | { content: string }
    | undefined;
  if (!row) return;
  const content = { ...JSON.parse(row.content), ...patch, heartbeatAt: Date.now() };
  db.prepare("UPDATE artifacts SET content = ? WHERE id = ?").run(
    JSON.stringify(content),
    id
  );
}

/** Refresh the heartbeat without disturbing the stage the build is reporting. */
function touch(id: string) {
  const row = db.prepare("SELECT content FROM artifacts WHERE id = ?").get(id) as
    | { content: string }
    | undefined;
  if (!row) return;
  const content = { ...JSON.parse(row.content), heartbeatAt: Date.now() };
  db.prepare("UPDATE artifacts SET content = ? WHERE id = ?").run(
    JSON.stringify(content),
    id
  );
}

/**
 * A build is considered dead once this long passes with no heartbeat. The
 * renderer is a single Python call that reports nothing for minutes, so the
 * window has to clear that comfortably — `buildVideo` keeps the heartbeat
 * ticking while it waits.
 */
const STALL_MS = 90_000;
const HEARTBEAT_MS = 20_000;

type VideoRow = { id: string; content: string; created_at: number };

/** Mark one row failed if its build is no longer reporting. Returns true if so. */
function reconcileRow(r: VideoRow): boolean {
  let content: Record<string, unknown>;
  try {
    content = JSON.parse(r.content);
  } catch {
    return false;
  }
  const progress = content.progress as VideoProgress | undefined;
  if (!progress || progress.stage === "done" || progress.stage === "failed") return false;

  // Rows written before heartbeats existed fall back to their creation time,
  // which is the only evidence available for them.
  const last = Number(content.heartbeatAt ?? r.created_at);
  if (Date.now() - last < STALL_MS) return false;

  db.prepare("UPDATE artifacts SET content = ? WHERE id = ?").run(
    JSON.stringify({
      ...content,
      progress: {
        stage: "failed",
        done: progress.done,
        total: progress.total,
        note:
          "The build stopped before it finished — usually because the server " +
          "restarted. Generate the video again to retry.",
      } satisfies VideoProgress,
    }),
    r.id
  );
  // Scratch from the dead run is worthless and can be hundreds of megabytes.
  try {
    fs.rmSync(videoWorkDir(r.id), { recursive: true, force: true });
  } catch {
    /* nothing to clean */
  }
  return true;
}

/**
 * Mark builds that are no longer running as failed.
 *
 * Without this a killed build leaves the player polling "Drawing the scenes"
 * forever, because a stage that never advances is indistinguishable from one
 * that is simply slow.
 */
export function reconcileStalledVideos(notebookId?: string): number {
  const rows = db
    .prepare(
      notebookId
        ? "SELECT id, content, created_at FROM artifacts WHERE type = 'video' AND notebook_id = ?"
        : "SELECT id, content, created_at FROM artifacts WHERE type = 'video'"
    )
    .all(...(notebookId ? [notebookId] : [])) as unknown as VideoRow[];

  let failed = 0;
  for (const r of rows) if (reconcileRow(r)) failed++;
  return failed;
}

/** Same check for a single artifact, for the endpoint the player polls. */
export function reconcileStalledVideo(id: string): boolean {
  const row = db
    .prepare(
      "SELECT id, content, created_at FROM artifacts WHERE id = ? AND type = 'video'"
    )
    .get(id) as unknown as VideoRow | undefined;
  return row ? reconcileRow(row) : false;
}

/**
 * The hand cutout is the same in every video, so it is generated once and
 * cached. Regenerating it per video would add a minute and a pound of tokens
 * for an identical picture.
 */
async function ensureHand(): Promise<string> {
  const file = path.join(videoDir(), "hand-marker.png");
  if (fs.existsSync(file) && fs.statSync(file).size > 10_000) return file;
  const { png } = await generateImage(HAND_PROMPT, {
    size: "1024x1536",
    quality: "high",
  });
  fs.mkdirSync(videoDir(), { recursive: true });
  fs.writeFileSync(file, png);
  return file;
}

async function narrate(text: string, speaker: string): Promise<Buffer> {
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' ` +
    `xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'>` +
    `<voice name='en-Multitalker:DragonHDLatestNeural'><mstts:dialog>` +
    `<mstts:turn speaker='${speaker}'>${addBreaths(escapeXml(text), 1)}</mstts:turn>` +
    `</mstts:dialog></voice></speak>`;
  return synthesizeRawSsml(ssml);
}

/** Run a handful at a time: the image deployment has small capacity. */
async function pool<T>(items: T[], n: number, work: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) await work(items[i], i);
    })
  );
}

function runRenderer(configPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = path.join(process.cwd(), "scripts", "whiteboard", "render.py");
    const py = process.env.PYTHON_BIN || "python";
    const child = spawn(py, [script, configPath], { cwd: process.cwd() });

    let err = "";
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e) =>
      reject(
        new Error(
          `Could not start Python ("${py}"). The renderer needs Python with numpy, Pillow and imageio-ffmpeg. ${e.message}`
        )
      )
    );
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`The renderer failed (exit ${code}). ${err.slice(-400)}`))
    );
  });
}

/**
 * Build the video. Runs detached from the request: artwork alone takes minutes,
 * so the caller records the artifact, returns, and the client watches progress
 * on the row.
 */
export async function buildVideo(
  id: string,
  plan: ScenePlan,
  voice: string
): Promise<void> {
  const work = videoWorkDir(id);
  fs.mkdirSync(work, { recursive: true });

  // The renderer reports nothing for minutes. Without this the row would look
  // abandoned and get reconciled away mid-render.
  const beat = setInterval(() => touch(id), HEARTBEAT_MS);

  try {
    await runBuild(id, plan, voice, work);
  } finally {
    clearInterval(beat);
  }
}

async function runBuild(
  id: string,
  plan: ScenePlan,
  voice: string,
  work: string
): Promise<void> {
  const scenes = plan.scenes;
  const images: string[] = new Array(scenes.length);
  const audios: string[] = new Array(scenes.length);

  setProgress(id, {
    progress: { stage: "artwork", done: 0, total: scenes.length } satisfies VideoProgress,
  });

  const hand = await ensureHand();

  let drawn = 0;
  // One at a time. The image deployment is small — two concurrent calls
  // collide on its per-minute call limit and spend the retry budget racing
  // each other rather than waiting.
  await pool(scenes, 1, async (scene: Scene, i: number) => {
    const { png } = await generateImage(scenePrompt(scene), {
      size: "1536x1024",
      quality: "medium",
    });
    const file = path.join(work, `scene-${String(i + 1).padStart(2, "0")}.png`);
    fs.writeFileSync(file, png);
    images[i] = file;
    drawn++;
    setProgress(id, {
      progress: { stage: "artwork", done: drawn, total: scenes.length } satisfies VideoProgress,
    });
  });

  setProgress(id, {
    progress: { stage: "narration", done: 0, total: scenes.length } satisfies VideoProgress,
  });

  let spoken = 0;
  await pool(scenes, 3, async (scene: Scene, i: number) => {
    const mp3 = await narrate(scene.narration, voice);
    const file = path.join(work, `narration-${String(i + 1).padStart(2, "0")}.mp3`);
    fs.writeFileSync(file, mp3);
    audios[i] = file;
    spoken++;
    setProgress(id, {
      progress: { stage: "narration", done: spoken, total: scenes.length } satisfies VideoProgress,
    });
  });

  setProgress(id, {
    progress: { stage: "rendering", done: 0, total: 1 } satisfies VideoProgress,
  });

  const out = videoPath(id);
  const config = {
    output: out.replace(/\\/g, "/"),
    hand: hand.replace(/\\/g, "/"),
    width: 1280,
    height: 720,
    art_height: 547,
    scenes: scenes.map((s, i) => ({
      image: images[i].replace(/\\/g, "/"),
      caption: s.caption,
      audio: audios[i].replace(/\\/g, "/"),
    })),
  };
  const configPath = path.join(work, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  await runRenderer(configPath);

  if (!fs.existsSync(out)) {
    throw new Error("The renderer finished but produced no file.");
  }

  // The silent intermediate is only needed while muxing.
  try {
    fs.unlinkSync(out.replace(/\.mp4$/, "-silent.mp4"));
  } catch {
    /* already cleaned up by the renderer */
  }

  setProgress(id, {
    progress: { stage: "done", done: 1, total: 1 } satisfies VideoProgress,
    videoUrl: `/api/video/${id}`,
    bytes: fs.statSync(out).size,
  });

  // Scene artwork and narration clips are only inputs to the render. Keeping
  // them costs several megabytes per video for no benefit once the MP4 exists.
  try {
    fs.rmSync(work, { recursive: true, force: true });
  } catch {
    /* leaving scratch behind is not worth failing a finished video */
  }
}
