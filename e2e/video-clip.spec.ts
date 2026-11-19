import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const VIDEO = `http://127.0.0.1:${process.env.MOCK_VIDEO_PORT || 3125}`;

type MockState = {
  created: { id: string; prompt: string; model: string; size: string; seconds: string; hasReference: boolean; authorized: boolean }[];
  deleted: string[];
};
const mockState = async (request: APIRequestContext) => (await (await request.get(`${VIDEO}/state`)).json()) as MockState;

async function openNotebook(page: Page, request: APIRequestContext) {
  await request.post(`${VIDEO}/control`, { data: { reset: true } });
  const nb = await request.post("/api/notebooks", { data: { title: "Video clips" } });
  const { id } = (await nb.json()) as { id: string };
  const source = await request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Garden notes", text: "The pilot built 24 raised beds in April. Volunteers water them weekly. ".repeat(12) },
  });
  expect(source.ok()).toBeTruthy();
  await page.goto(`/notebook/${id}`);
  return id;
}

async function compose(page: Page, prompt: string, seconds = "4") {
  await page.getByRole("button", { name: "Generate Video clip", exact: true }).click();
  const composer = page.getByRole("dialog", { name: "Video clip" });
  await expect(composer).toBeVisible();
  const box = composer.getByTestId("clip-prompt");
  // The prompt is drafted from the sources first, then edited by the person.
  await expect(box).toHaveValue(/raised garden beds at dawn/);
  await box.fill(prompt);
  await composer.getByLabel("Length").selectOption(seconds);
  return composer;
}

test("drafts a prompt, shows the cost, makes the clip and plays it from the library", async ({ page, request }) => {
  const notebookId = await openNotebook(page, request);
  const composer = await compose(page, "A calm shot of tomato seedlings in a greenhouse, soft light, one continuous shot.");

  // 4 seconds at the neutral default of $0.10 per second, then 8 seconds.
  await composer.getByLabel("Length").selectOption("4");
  await expect(composer.getByTestId("clip-estimate")).toContainText("$0.40");
  await composer.getByLabel("Length").selectOption("8");
  await expect(composer.getByTestId("clip-estimate")).toContainText("$0.80");
  await expect(composer).toContainText("An estimate, not a quote, at $0.10 per second");

  await composer.getByTestId("clip-generate").click();

  const viewer = page.getByTestId("clip-viewer");
  await expect(viewer).toBeVisible();
  await expect(page.getByTestId("clip-summary")).toHaveText("1 clip ready.", { timeout: 30_000 });

  const video = viewer.locator("video");
  const src = await video.getAttribute("src");
  expect(src).toMatch(/^\/api\/videoclip\/[\w-]+\/0$/);
  await expect(video).toHaveAttribute("poster", /\/poster$/);
  await expect(viewer.getByRole("link", { name: "Download MP4" })).toHaveAttribute("download", /tomato seedlings.*\.mp4$/);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => Math.round(v.duration))).toBe(2);

  // Seeking needs byte ranges.
  const ranged = await request.get(src!, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toMatch(/^bytes 0-99\//);

  // What reached the provider: the edited prompt, 8 s landscape, the configured model and key.
  const { created } = await mockState(request);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ model: "mock-video", size: "1280x720", seconds: "8", authorized: true, hasReference: false });
  expect(created[0].prompt).toContain("tomato seedlings");

  const listed = (await (await request.get(`/api/notebooks/${notebookId}`)).json()) as { artifacts: { type: string; title: string }[] };
  expect(listed.artifacts.some((a) => a.type === "clip")).toBe(true);

  // Rename keeps the library and the viewer in step.
  await viewer.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Clip set name").fill("Greenhouse B-roll");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Greenhouse B-roll" })).toBeVisible();
});

test("shows the provider's refusal for a prompt it declines", async ({ page, request }) => {
  await openNotebook(page, request);
  const composer = await compose(page, "BLOCKME a famous person waving at the camera in a garden.");
  await composer.getByTestId("clip-generate").click();

  await expect(page.getByTestId("clip-summary")).toHaveText("No clips were made.", { timeout: 30_000 });
  const alert = page.getByTestId("clip-viewer").getByRole("alert");
  await expect(alert).toContainText("Declined by the content filter");
  await expect(alert).toContainText("describes a real person");
  await expect(page.getByTestId("clip-viewer").locator("video")).toHaveCount(0);
});

test("cancels a clip that is still being made and has the provider delete the job", async ({ page, request }) => {
  await openNotebook(page, request);
  const composer = await compose(page, "SLOWJOB a long slow pan across the vegetable beds in the evening.");
  await composer.getByTestId("clip-generate").click();

  const summary = page.getByTestId("clip-summary");
  await expect(summary).toContainText("Making 1 clip");
  await expect(summary).toHaveAttribute("aria-live", "polite");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(summary).toHaveText("Cancelled.", { timeout: 30_000 });
  await expect.poll(async () => (await mockState(request)).deleted.length).toBe(1);
});

test("says no video model is configured and links to the setup guide", async ({ page, request }) => {
  await page.route("**/api/videoclip", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: { configured: false, reason: "No video model is configured.", budget: { enabled: false, remainingCents: null } } });
  });
  await openNotebook(page, request);

  const card = page.getByTestId("clip-card");
  await expect(card.getByTestId("clip-unconfigured")).toContainText("No video model is configured.");
  await expect(card.getByRole("link", { name: "Set one up" })).toHaveAttribute("href", /docs\/video-clips\.md$/);
  await expect(card.getByRole("button", { name: "Generate Video clip", exact: true })).toBeDisabled();
});

test("the composer is a proper dialog: Escape closes it and focus goes back", async ({ page, request }) => {
  await openNotebook(page, request);
  const trigger = page.getByRole("button", { name: "Generate Video clip", exact: true });
  await trigger.click();
  const composer = page.getByRole("dialog", { name: "Video clip" });
  await expect(composer).toBeVisible();
  await expect(composer.getByLabel("Clip prompt 1")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(composer).toBeHidden();
  await expect(trigger).toBeFocused();
});
