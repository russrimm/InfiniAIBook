import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Video clips as training-video visuals, in a real browser: planning proposes
 * them only when asked, a clip is made only when its Generate button is pressed,
 * it plays muted under its caption in the timeline preview, and rendering never
 * makes one. The video model is e2e/mock-video.mjs, so nothing is billed.
 */

const VIDEO = `http://127.0.0.1:${process.env.MOCK_VIDEO_PORT || 3125}`;

async function notebookWithSource(request: APIRequestContext): Promise<string> {
  await request.post(`${VIDEO}/control`, { data: { reset: true } });
  const nb = await request.post("/api/notebooks", { data: { title: "Garden pilot clips" } });
  const { id } = (await nb.json()) as { id: string };
  const src = await request.post(`/api/notebooks/${id}/sources`, {
    data: {
      title: "Garden notes",
      text:
        "The Riverside garden pilot builds 24 raised beds in April 2025. " +
        "A drip kit costs $640 and uses about 40% less water than hand watering.",
    },
  });
  expect(src.ok()).toBeTruthy();
  return id;
}

type Training = {
  id: string;
  content: { sections: { cues?: { kind: string; clipId?: string; clipSeconds?: number; clipPrompt?: string }[] }[] };
};

test("proposes clips on request, makes one on demand, previews it and renders without making another", async ({ page, request }) => {
  const notebookId = await notebookWithSource(request);
  await page.goto(`/notebook/${notebookId}`);
  await page.getByRole("button", { name: "Generate Training video" }).click();

  const dialog = page.getByRole("dialog").last();
  const visualsTab = dialog.getByRole("tab", { name: "Visuals" });
  await expect(visualsTab).toBeVisible({ timeout: 30_000 });
  await visualsTab.click();

  const list = (await (await request.get(`/api/notebooks/${notebookId}`)).json()) as { artifacts: { id: string; type: string }[] };
  const id = list.artifacts.find((a) => a.type === "training")!.id;
  const cuesOf = async () => ((await (await request.get(`/api/artifacts/${id}`)).json()) as Training).content.sections.flatMap((s) => s.cues ?? []);

  // The planner offers no clips unless asked, because each one costs money.
  expect(await cuesOf()).not.toContainEqual(expect.objectContaining({ kind: "clip" }));
  await expect(dialog.getByRole("button", { name: /^Video clip/ })).toHaveCount(0);

  await dialog.getByLabel("Propose video clips").check();
  await dialog.getByRole("button", { name: "Plan all visuals again" }).click();
  const clipCue = dialog.getByRole("button", { name: /^Video clip/ });
  await expect(clipCue).toBeVisible({ timeout: 30_000 });

  // Proposing a clip generates nothing.
  expect((await (await request.get(`${VIDEO}/state`)).json()).created).toHaveLength(0);
  await clipCue.click();
  const controls = dialog.getByTestId("clip-controls");
  await expect(controls.getByLabel("Clip prompt")).toHaveValue(/dolly shot along a row of raised garden beds/);
  await expect(controls.getByTestId("clip-cue-estimate")).toContainText("$0.80");
  await expect(controls).toContainText("A visual without a clip is left out of the render");

  await controls.getByTestId("clip-cue-generate").click();
  await expect(controls.getByTestId("clip-cue-video")).toBeVisible({ timeout: 40_000 });
  await expect(controls.getByTestId("clip-cue-status")).toHaveText("Clip ready");
  expect((await (await request.get(`${VIDEO}/state`)).json()).created).toHaveLength(1);

  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("button", { name: "Saved" })).toBeVisible();
  const saved = (await cuesOf()).find((c) => c.kind === "clip")!;
  expect(saved.clipId).toMatch(/^[A-Za-z0-9_-]{12}$/);
  expect(saved.clipSeconds).toBe(8);

  const media = await request.get(`/api/training/${id}/cueclips/${saved.clipId}`, { headers: { range: "bytes=0-99" } });
  expect(media.status()).toBe(206);

  // The preview plays the clip, without sound, in the visual's panel at the moment it is on screen.
  await dialog.getByRole("tab", { name: "Preview" }).click();
  const marker = dialog.getByRole("button", { name: /^Video clip at / });
  await expect(marker).toBeVisible();
  const at = /at (\d+):(\d{2})/.exec((await marker.getAttribute("aria-label")) ?? "")!;
  const seconds = Number(at[1]) * 60 + Number(at[2]);
  await dialog.getByRole("slider", { name: "Preview position" }).fill(String(seconds + 1));
  const preview = dialog.getByTestId("preview-clip");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty("muted", true);
  await expect.poll(() => preview.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);

  // Rendering draws every visual, including this one's caption, and starts no clip of its own.
  await dialog.getByRole("button", { name: "Render video" }).click();
  await expect(dialog.getByText(/Azure Speech resource/)).toBeVisible({ timeout: 45_000 });
  const raster = (await (await request.get(`/api/training/${id}/raster`)).json()) as { missing: unknown[] };
  expect(raster.missing).toEqual([]);
  expect((await (await request.get(`${VIDEO}/state`)).json()).created).toHaveLength(1);
});

test("says no video model is configured for a clip visual added by hand, and does not offer to propose clips", async ({ page, request }) => {
  await page.route("**/api/videoclip", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: { configured: false, reason: "No video model is configured." } });
  });
  const notebookId = await notebookWithSource(request);
  await page.goto(`/notebook/${notebookId}`);
  await page.getByRole("button", { name: "Generate Training video" }).click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog.getByRole("tab", { name: "Visuals" })).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("tab", { name: "Visuals" }).click();

  // No video model: nothing to propose, and the option is not offered.
  await expect(dialog.getByLabel("Propose video clips")).toHaveCount(0);

  // Adding one by hand still explains why it cannot be generated.
  const stat = dialog.getByRole("button", { name: /^Key number/ });
  await stat.click();
  await dialog.locator('select:has(option[value="clip"])').selectOption("clip");
  const controls = dialog.getByTestId("clip-controls");
  await expect(controls.getByTestId("clip-unconfigured")).toContainText("No video model is configured");
  await expect(controls.getByRole("link", { name: "Set one up" })).toHaveAttribute("href", /docs\/video-clips\.md$/);
});
