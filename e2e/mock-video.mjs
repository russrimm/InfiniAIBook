// A stand-in for an OpenAI-compatible Videos API (POST /v1/videos, poll, download,
// delete), so the end-to-end tests run the real clip pipeline with no provider
// and no cost. The fixture is a two-second VP9 clip: Chromium plays VP9 in MP4
// without the proprietary codecs Playwright's build lacks.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.MOCK_VIDEO_PORT || 3125);
const here = path.dirname(fileURLToPath(import.meta.url));
const CLIP = fs.readFileSync(path.join(here, "fixtures", "clip.mp4"));
const POSTER = fs.readFileSync(path.join(here, "fixtures", "clip-poster.jpg"));

/** Jobs by id: what was asked for and how many times it has been polled. */
const jobs = new Map();
const created = [];
const deleted = [];
let nextId = 1;
/** When set, jobs whose prompt contains SLOWJOB finish; otherwise they stay in progress. */
let release = false;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const field = (raw, name) => {
  const m = new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(raw);
  return m ? m[1] : undefined;
};

const statusOf = (job) => {
  job.polls += 1;
  if (job.prompt.includes("BLOCKME")) {
    return {
      id: job.id,
      object: "video",
      status: "failed",
      progress: 0,
      error: { code: "moderation_blocked", message: "Your request was rejected by our safety system: it describes a real person." },
    };
  }
  if (job.prompt.includes("SLOWJOB") && !release) {
    return { id: job.id, object: "video", status: "in_progress", progress: 35 };
  }
  if (job.polls < 2) return { id: job.id, object: "video", status: "in_progress", progress: 40 };
  return { id: job.id, object: "video", status: "completed", progress: 100 };
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

    // Test control and inspection.
    if (url.pathname === "/state") return send(res, 200, { created, deleted });
    if (url.pathname === "/control" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      return req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        if (body.reset) {
          jobs.clear();
          created.length = 0;
          deleted.length = 0;
          release = false;
        }
        if (typeof body.release === "boolean") release = body.release;
        send(res, 200, { release });
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/videos") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      return req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("latin1");
        const prompt = field(raw, "prompt") ?? "";
        const id = `video_${nextId++}`;
        jobs.set(id, { id, prompt, polls: 0 });
        created.push({
          id,
          prompt,
          model: field(raw, "model"),
          size: field(raw, "size"),
          seconds: field(raw, "seconds"),
          hasReference: raw.includes('name="input_reference"'),
          authorized: req.headers.authorization === "Bearer e2e-video-key",
        });
        send(res, 200, { id, object: "video", model: field(raw, "model"), status: "queued", progress: 0 });
      });
    }

    const m = /^\/v1\/videos\/([\w-]+)(\/content)?$/.exec(url.pathname);
    if (!m) return send(res, 404, { error: { message: "not found" } });
    const job = jobs.get(m[1]);
    if (!job) return send(res, 404, { error: { message: "no such video" } });

    if (req.method === "DELETE") {
      deleted.push(job.id);
      jobs.delete(job.id);
      return send(res, 200, { id: job.id, deleted: true });
    }
    if (req.method === "GET" && m[2]) {
      if (url.searchParams.get("variant") === "thumbnail") {
        res.writeHead(200, { "content-type": "image/jpeg", "content-length": POSTER.length });
        return res.end(POSTER);
      }
      res.writeHead(200, { "content-type": "video/mp4", "content-length": CLIP.length });
      return res.end(CLIP);
    }
    if (req.method === "GET") return send(res, 200, statusOf(job));
    return send(res, 405, { error: { message: "method not allowed" } });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock video on http://127.0.0.1:${PORT}`));
