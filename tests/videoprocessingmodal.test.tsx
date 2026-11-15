import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import VideoPlayer from "@/components/VideoPlayer";
import TrainingVideo from "@/components/TrainingVideo";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import type { TrainingContent } from "@/lib/types";
import { DEFAULT_COMPOSITION } from "@/lib/trainingvisuals";

describe("video processing modals", () => {
  it("shows whiteboard and motion rendering progress when reopened during a build", () => {
    for (const variant of ["whiteboard", "motion"] as const) {
      const html = renderToStaticMarkup(
        <VideoPlayer
          artifactId="video"
          variant={variant}
          onRefresh={() => {}}
          content={{ title: "Video", scenes: [], progress: { stage: "rendering", done: 42, total: 100 } }}
        />,
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain("Video processing status");
      expect(html).toContain('aria-valuenow="42"');
    }
  });

  it("shows the real training render stage and composition percentage", () => {
    const content: TrainingContent = {
      title: "Training",
      sections: [{ title: "Welcome", text: "Welcome to training." }],
      objectives: [],
      presenter: "lisa",
      voice: "en-US-AvaMultilingualNeural",
      background: "#ffffff",
      composition: { ...DEFAULT_COMPOSITION, mode: "composed" },
      progress: { stage: "composing", renderPct: 61 },
    };
    const html = renderToStaticMarkup(
      <ConfirmProvider><TrainingVideo artifactId="training" content={content} onRefresh={() => {}} /></ConfirmProvider>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Video processing status");
    expect(html).toContain("Composing the visuals over the presenter");
    expect(html).toContain('aria-valuenow="61"');
  });
});
