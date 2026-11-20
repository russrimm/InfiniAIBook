import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Optional intro and outro clips on a training video and a motion explainer, in
 * a real browser: off by default, drafted and priced before anything is billed,
 * generated or uploaded, previewed in the final order, and a render that would
 * silently drop a requested one is refused. The video model is
 * e2e/mock-video.mjs, so nothing is billed.
 */

const VIDEO = `http://127.0.0.1:${process.env.MOCK_VIDEO_PORT || 3125}`;
test.describe.configure({ timeout: 120_000 });

const FIXTURE = path.join(__dirname, "fixtures", "clip.mp4");

async function notebookWithSource(request: APIRequestContext): Promise<string> {
  await request.post(`${VIDEO}/control`, { data: { reset: true } });
  const nb = await request.post("/api/notebooks", { data: { title: "Garden pilot bookends" } });
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

const created = async (request: APIRequestContext) =>
  ((await (await request.get(`${VIDEO}/state`)).json()) as { created: { prompt: string; seconds: string }[] }).created;

async function artifactId(request: APIRequestContext, notebookId: string, type: string) {
  const list = (await (await request.get(`/api/notebooks/${notebookId}`)).json()) as { artifacts: { id: string; type: string }[] };
  return list.artifacts.find((a) => a.type === type)!.id;
}

/** Everything both editors share, driven the same way on either video. */
async function exerciseBookends(editor: Locator, request: APIRequestContext, id: string) {
  // Off by default: no tiles filled, no cost, nothing made.
  await expect(editor.getByTestId("bookend-tile-intro")).toContainText("Off");
  await expect(editor.getByTestId("bookend-tile-outro")).toContainText("Off");
  await expect(editor.getByTestId("bookend-estimate")).toHaveCount(0);

  // Intro with AI: the prompt is drafted from the video, edited by the person, and priced first.
  await editor.getByTestId("bookend-mode-intro").selectOption("ai");
  await editor.getByTestId("bookend-draft-intro").click();
  const prompt = editor.getByTestId("bookend-prompt-intro");
  await expect(prompt).toHaveValue(/slow push-in over a sunlit community garden/, { timeout: 30_000 });
  await expect(editor.getByTestId("bookend-estimate")).toContainText("Estimated cost");
  await expect(editor.getByTestId("bookend-generate-intro")).toContainText("$0.40");
  expect(await created(request)).toHaveLength(0);

  // Outro by upload, so the two sources are mixed.
  await editor.getByTestId("bookend-mode-outro").selectOption("upload");
  await expect(editor.getByTestId("bookend-status-outro")).toContainText("Rendering is blocked until there is one");

  // A render is refused while either requested clip is missing: never a silent drop.
  const blocked = await request.post(id.startsWith("m:") ? `/api/video/${id.slice(2)}/render` : `/api/training/${id}/render`);
  expect(blocked.status()).toBe(409);
  expect(JSON.stringify(await blocked.json())).toMatch(/intro clip is turned on but has no clip/);

  await editor.getByTestId("bookend-generate-intro").click();
  await expect(editor.getByTestId("bookend-video-intro")).toBeVisible({ timeout: 40_000 });
  await expect(editor.getByTestId("bookend-tile-intro")).not.toContainText("not made yet");
  expect(await created(request)).toHaveLength(1);

  await editor.getByTestId("bookend-file-outro").setInputFiles(FIXTURE);
  await expect(editor.getByTestId("bookend-video-outro")).toBeVisible({ timeout: 30_000 });

  // The final order: intro, the video, outro, with the join named.
  const order = editor.getByTestId("bookend-timeline");
  await expect(order).toContainText("Intro clip");
  await expect(order).toContainText("Outro clip");
  await expect(editor.getByTestId("bookend-fade")).toHaveValue("short");
  // Nothing left to pay for: both clips exist.
  await expect(editor.getByTestId("bookend-estimate")).toHaveCount(0);
  await editor.getByTestId("bookend-fade").selectOption("cut");
  await expect(editor.getByTestId("bookend-saved")).toHaveText("Saved");

  const state = (await (await request.get(`/api/bookends/${id.replace(/^m:/, "")}`)).json()) as {
    bookends: { intro: { mode: string; clipId?: string; label?: string }; outro: { mode: string; clipId?: string; label?: string }; fade: string };
    problems: string[];
  };
  expect(state.bookends.intro).toMatchObject({ mode: "ai", label: "Generated with AI" });
  expect(state.bookends.outro).toMatchObject({ mode: "upload", label: "clip.mp4" });
  expect(state.bookends.fade).toBe("cut");
  expect(state.problems).toEqual([]);
  const media = await request.get(`/api/bookends/${id.replace(/^m:/, "")}/media/${state.bookends.outro.clipId}`, { headers: { range: "bytes=0-99" } });
  expect(media.status()).toBe(206);

  // A re-render reuses the clip: asking for the same video again creates nothing new.
  expect(await created(request)).toHaveLength(1);

  // Turning one off lets the render go ahead without it, and keeps what was made for later.
  await editor.getByTestId("bookend-mode-outro").selectOption("off");
  await expect(editor.getByTestId("bookend-tile-outro")).toContainText("Off");
}

async function openTraining(page: Page, request: APIRequestContext) {
  const notebookId = await notebookWithSource(request);
  await page.goto(`/notebook/${notebookId}`);
  await page.getByRole("button", { name: "Generate Training video" }).click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog.getByRole("tab", { name: "Design" })).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("tab", { name: "Design" }).click();
  return { dialog, id: await artifactId(request, notebookId, "training") };
}

test("a training video: intro by AI and outro by upload, priced first, in the final order", async ({ page, request }) => {
  const { dialog, id } = await openTraining(page, request);
  await exerciseBookends(dialog.getByTestId("bookends-editor"), request, id);
});

test("a training video renders past the intro and outro check once both are ready or off", async ({ page, request }) => {
  const { dialog, id } = await openTraining(page, request);
  const editor = dialog.getByTestId("bookends-editor");
  await editor.getByTestId("bookend-mode-intro").selectOption("upload");
  await editor.getByTestId("bookend-file-intro").setInputFiles(FIXTURE);
  await expect(editor.getByTestId("bookend-video-intro")).toBeVisible({ timeout: 30_000 });
  const ready = await request.post(`/api/training/${id}/render`);
  // Past the bookend check: what stops it now is the missing Azure Speech resource, not the clip.
  expect(JSON.stringify(await ready.json())).not.toMatch(/intro clip/);
});

test("a motion explainer: the same editor, in its script settings", async ({ page, request }) => {
  const notebookId = await notebookWithSource(request);
  await page.goto(`/notebook/${notebookId}`);
  await page.getByRole("button", { name: "Generate Motion explainer", exact: true }).click();
  const dialog = page.getByRole("dialog").last();
  const summary = dialog.getByText("Intro and outro clips (optional)");
  await expect(summary).toBeVisible({ timeout: 90_000 });
  await summary.click();
  const id = await artifactId(request, notebookId, "motion");
  await exerciseBookends(dialog.getByTestId("bookends-editor"), request, `m:${id}`);
});

test("says no video model is configured, and still offers an uploaded clip", async ({ page, request }) => {
  await page.route("**/api/bookends/*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const json = await res.json();
    await route.fulfill({ json: { ...json, video: { configured: false, reason: "No video model is configured." }, estimate: null } });
  });
  const { dialog } = await openTraining(page, request);
  const editor = dialog.getByTestId("bookends-editor");
  await expect(editor.getByTestId("bookend-unconfigured")).toContainText("No video model is configured");
  await expect(editor.getByRole("link", { name: "Set one up" })).toHaveAttribute("href", /docs\/video-clips\.md$/);
  await editor.getByTestId("bookend-mode-outro").selectOption("upload");
  await expect(editor.getByTestId("bookend-file-outro")).toBeVisible();
});
