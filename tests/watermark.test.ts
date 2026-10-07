import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeWatermark } from "@/lib/watermarkchoice";
import {
  applyWatermark,
  deleteWatermarkImage,
  listWatermarkImages,
  saveWatermarkImage,
  stampWatermark,
  watermarkImageFile,
} from "@/lib/watermark";

/** A 1 × 1 transparent PNG. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("normalizeWatermark", () => {
  it("treats anything malformed or empty as no watermark", () => {
    expect(normalizeWatermark(null)).toBeNull();
    expect(normalizeWatermark({ kind: "text", text: "   " })).toBeNull();
    expect(normalizeWatermark({ kind: "image", image: "../etc/passwd" })).toBeNull();
    expect(normalizeWatermark({ kind: "video", text: "x" })).toBeNull();
  });

  it("fills in the layout and cleans the text", () => {
    expect(normalizeWatermark({ kind: "text", text: "  © Contoso\n\tLearning " })).toEqual({
      kind: "text",
      text: "© Contoso Learning",
      position: "bottom-right",
      size: "medium",
      opacity: "medium",
    });
    expect(
      normalizeWatermark({
        kind: "image",
        image: "w-abcdefghij",
        position: "top-left",
        size: "huge",
        opacity: "solid",
      })
    ).toEqual({
      kind: "image",
      image: "w-abcdefghij",
      position: "top-left",
      size: "medium",
      opacity: "solid",
    });
    expect(
      (normalizeWatermark({ kind: "text", text: "x".repeat(200) }) as { text: string }).text
    ).toHaveLength(80);
  });
});

describe("watermark image library", () => {
  it("uploads, lists and deletes PNGs", () => {
    expect(listWatermarkImages()).toEqual([]);
    expect(() => saveWatermarkImage("logo.png", "data:image/jpeg;base64,AAAA")).toThrow(/PNG/);
    const img = saveWatermarkImage("Contoso Logo (dark).png", PNG);
    expect(img.id).toMatch(/^w-[A-Za-z0-9_-]{10}$/);
    expect(img.name).toBe("Contoso Logo dark");
    expect(listWatermarkImages()).toEqual([img]);
    expect(watermarkImageFile(img.id)).toMatch(/\.png$/);
    expect(watermarkImageFile("../../secret")).toBeNull();
    expect(deleteWatermarkImage(img.id)).toBe(true);
    expect(deleteWatermarkImage(img.id)).toBe(false);
    expect(listWatermarkImages()).toEqual([]);
  });

  it("does nothing without a watermark and notes a deleted image", async () => {
    const file = path.join(process.env.DATA_DIR!, "untouched.mp4");
    fs.writeFileSync(file, "not really a video");
    expect(await applyWatermark(file, null)).toBe(false);
    const missing = await stampWatermark(file, { kind: "image", image: "w-abcdefghij" }, "test");
    expect(missing).toEqual({ watermarked: false, note: expect.stringMatching(/without it/) });
    expect(fs.readFileSync(file, "utf8")).toBe("not really a video");
  });
});

const python = process.env.PYTHON_BIN || "python";
const canRender =
  spawnSync(python, ["-c", "import PIL, imageio_ffmpeg"], { stdio: "ignore" }).status === 0;

describe.skipIf(!canRender)("stamping a video", () => {
  it("overlays text and images and keeps the soundtrack", async () => {
    const dir = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "wm-"));
    const video = path.join(dir, "clip.mp4");
    const made = spawnSync(
      python,
      [
        "-c",
        "import imageio_ffmpeg, subprocess, sys; subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', " +
          "'-f', 'lavfi', '-i', 'color=c=gray:size=320x180:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=440', " +
          "'-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', sys.argv[1]], check=True)",
        video,
      ],
      { encoding: "utf8" }
    );
    expect(made.status, made.stderr).toBe(0);
    const before = fs.statSync(video).size;

    expect(await applyWatermark(video, { kind: "text", text: "Contoso", position: "center" })).toBe(true);
    const afterText = fs.statSync(video).size;
    expect(afterText).toBeGreaterThan(0);
    expect(afterText).not.toBe(before);

    const img = saveWatermarkImage("dot.png", PNG);
    expect(
      await applyWatermark(video, { kind: "image", image: img.id, position: "top-left", size: "large" })
    ).toBe(true);

    const probe = spawnSync(
      python,
      [
        "-c",
        "import imageio_ffmpeg, subprocess, sys; print(subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-i', sys.argv[1]], capture_output=True, text=True).stderr)",
        video,
      ],
      { encoding: "utf8" }
    );
    expect(probe.stdout).toMatch(/Video: h264.*320x180/);
    expect(probe.stdout).toMatch(/Audio: aac/);
    expect(fs.readdirSync(dir).sort()).toEqual(["clip.mp4"]);
  }, 60_000);
});
