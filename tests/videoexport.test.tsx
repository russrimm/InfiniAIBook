import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GET } from "@/app/api/video/[id]/route";
import ArtifactModal from "@/components/ArtifactModal";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { db } from "@/lib/db";
import { DEFAULT_COMPOSITION } from "@/lib/trainingvisuals";
import { videoDir, videoPath } from "@/lib/paths";
import type { Artifact } from "@/lib/types";
import {
  attachmentDisposition,
  videoDownloadHref,
  videoExportState,
  videoFilename,
} from "@/lib/videoexport";

const training = (content: Record<string, unknown>, title = "Onboarding: Day 1!"): Artifact =>
  ({
    id: "t1",
    notebookId: "n",
    type: "training",
    title,
    createdAt: 1,
    content: {
      title,
      sections: [{ title: "Welcome", text: "Welcome to training." }],
      objectives: [],
      presenter: "lisa",
      voice: "en-US-AvaMultilingualNeural",
      background: "#ffffff",
      composition: { ...DEFAULT_COMPOSITION, mode: "composed" },
      ...content,
    },
  }) as unknown as Artifact;

describe("videoExportState", () => {
  it("is ready with an attachment link and a .mp4 name once rendered", () => {
    const state = videoExportState(
      training({ videoUrl: "/api/video/t1?v=9", progress: { stage: "done" } })
    );
    expect(state).toEqual({
      kind: "ready",
      href: "/api/video/t1?v=9&download=1",
      filename: "Onboarding Day 1.mp4",
    });
  });

  it("reports not rendered, rendering and failed without ever offering a file", () => {
    expect(videoExportState(training({ progress: { stage: "transcript" } })).kind).toBe("not-rendered");
    expect(videoExportState(training({ progress: { stage: "composing" } })).kind).toBe("rendering");
    expect(
      videoExportState(training({ progress: { stage: "failed", note: "Speech quota" } }))
    ).toEqual({ kind: "failed", note: "Speech quota" });
  });

  it("keeps the previous file downloadable when a later render failed", () => {
    expect(
      videoExportState(training({ videoUrl: "/api/video/t1", progress: { stage: "failed" } })).kind
    ).toBe("ready");
  });

  it("does not hand over a file that a running re-render is about to replace", () => {
    expect(
      videoExportState(training({ videoUrl: "/api/video/t1", progress: { stage: "rendering" } })).kind
    ).toBe("rendering");
  });
});

describe("video filenames and headers", () => {
  it("always ends in .mp4 and falls back when the title has no usable characters", () => {
    expect(videoFilename("Quarterly review")).toBe("Quarterly review.mp4");
    expect(videoFilename("🎬🎬")).toBe("video.mp4");
    expect(videoFilename("x".repeat(100))).toBe(`${"x".repeat(60)}.mp4`);
  });

  it("adds the download flag whether or not the URL has a query", () => {
    expect(videoDownloadHref("/api/video/a")).toBe("/api/video/a?download=1");
    expect(videoDownloadHref("/api/video/a?v=2")).toBe("/api/video/a?v=2&download=1");
  });

  it("builds an attachment header that survives quotes and non-ASCII names", () => {
    expect(attachmentDisposition("Plan.mp4")).toBe(
      `attachment; filename="Plan.mp4"; filename*=UTF-8''Plan.mp4`
    );
    const header = attachmentDisposition('Caf\u00e9 "x".mp4');
    expect(header).toContain('filename="Caf_ _x_.mp4"');
    expect(header).toContain("filename*=UTF-8''Caf%C3%A9%20%22x%22.mp4");
  });
});

describe("GET /api/video/[id]", () => {
  const id = "dltest1";
  beforeAll(() => {
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run("dlnb", "N", "N", 1);
    db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, "dlnb", "training", "Safety Basics", "{}", 1);
    fs.mkdirSync(videoDir(), { recursive: true });
    fs.writeFileSync(videoPath(id), Buffer.from("0123456789"));
  });

  const get = (query: string, range?: string) =>
    GET(new Request(`http://localhost/api/video/${id}${query}`, { headers: range ? { range } : {} }), {
      params: Promise.resolve({ id }),
    });

  it("downloads as a named video/mp4 attachment, keeping range support", async () => {
    const res = await get("?download=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="Safety Basics.mp4"; filename*=UTF-8''Safety%20Basics.mp4`
    );
    expect(res.headers.get("content-length")).toBe("10");
    const part = await get("?download=1", "bytes=2-4");
    expect(part.status).toBe(206);
    expect(part.headers.get("content-disposition")).toContain("Safety Basics.mp4");
  });

  it("still plays inline when the download flag is absent", async () => {
    const res = await get("");
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("is a 404 when nothing has been rendered", async () => {
    const res = await GET(new Request("http://localhost/api/video/none1?download=1"), {
      params: Promise.resolve({ id: "none1" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("ArtifactModal video export buttons", () => {
  const html = (a: Artifact) =>
    renderToStaticMarkup(
      <ConfirmProvider>
        <ArtifactModal artifact={a} onClose={() => {}} />
      </ConfirmProvider>
    );

  it("makes Export MP4 a real download link and keeps the script as a separate Markdown button", () => {
    const out = html(training({ videoUrl: "/api/video/t1?v=9", progress: { stage: "done" } }));
    expect(out).toContain('href="/api/video/t1?v=9&amp;download=1"');
    expect(out).toContain('download="Onboarding Day 1.mp4"');
    expect(out).toContain("Export MP4");
    expect(out).toContain("Script (Markdown)");
    expect(out).toContain("Copy script");
  });

  it("offers a button, not a dead link, before the video is rendered", () => {
    const out = html(training({ progress: { stage: "transcript" } }));
    expect(out).toMatch(/<button[^>]*>Export MP4<\/button>/);
    expect(out).not.toContain("download=1");
    expect(out).toContain("Script (Markdown)");
  });
});
