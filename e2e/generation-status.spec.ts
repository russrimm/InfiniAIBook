import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function openNotebook(page: Page, request: APIRequestContext) {
  const nb = await request.post("/api/notebooks", { data: { title: "Generation status" } });
  const { id } = await nb.json() as { id: string };
  const source = await request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Field notes", text: "Chlorophyll absorbs blue and red light. ".repeat(20) },
  });
  expect(source.ok()).toBeTruthy();
  await page.goto(`/notebook/${id}`);
}

const heldFailure = async (page: Page, path: string) => {
  let release!: () => void;
  const hold = new Promise<void>((r) => { release = r; });
  await page.route(`**${path}`, async (route) => {
    expect(route.request().headers().accept).toBe("application/x-ndjson");
    await hold;
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: [
        JSON.stringify({ event: "status", status: "Writing the draft" }),
        JSON.stringify({ event: "result", status: 429, body: { error: "Test generation quota exceeded" } }),
        "",
      ].join("\n"),
    });
  });
  return release;
};

for (const [label, path] of [
  ["Audio overview", "/api/podcast"],
  ["Whiteboard video", "/api/video"],
  ["Motion explainer", "/api/motion"],
  ["Training video", "/api/training"],
  ["Report", "/api/generate"],
  ["Quiz", "/api/generate"],
  ["Flashcards", "/api/generate"],
  ["Infographic", "/api/generate"],
] as const) {
  test(`${label} opens a dismissible status modal and shows generation failures`, async ({ page, request }) => {
    await openNotebook(page, request);
    const release = await heldFailure(page, path);
    const button = page.getByRole("button", { name: `Generate ${label}`, exact: true });
    await button.click();
    const modal = page.getByRole("dialog", { name: "Generation status" });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("status")).toHaveText("Sending generation request");
    await expect(modal.getByRole("heading", { name: label, exact: true })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(modal.getByRole("button", { name: "Close generation status" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(modal.getByRole("button", { name: "Close generation status" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    const working = page.getByRole("button", { name: `View ${label} generation status`, exact: true });
    await expect(working).toBeFocused();
    await expect(working).toHaveText("Working…");
    await working.click();
    await expect(modal).toBeVisible();
    release();
    await expect(modal.getByRole("alert")).toHaveText("Test generation quota exceeded");
    await modal.getByRole("button", { name: "Close generation status" }).click();
    await expect(button).toBeEnabled();
    await expect(page.getByRole("alert").filter({ hasText: "Test generation quota exceeded" })).toBeVisible();
  });
}

test("concurrent formats share the modal without starting duplicate jobs", async ({ page, request }) => {
  await openNotebook(page, request);
  const releaseAudio = await heldFailure(page, "/api/podcast");
  const releaseVideo = await heldFailure(page, "/api/video");
  await page.getByRole("button", { name: "Generate Audio overview", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Generate Whiteboard video", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Generation status" });
  await expect(modal.getByRole("heading", { name: "Audio overview", exact: true })).toBeVisible();
  await expect(modal.getByRole("heading", { name: "Whiteboard video", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View status", exact: true }).click();
  await expect(modal.getByRole("status")).toHaveCount(2);
  releaseAudio();
  releaseVideo();
  await expect(modal.getByRole("alert")).toHaveCount(2);
});

test("real generation streams server stages and replaces the status modal with the result", async ({ page, request }) => {
  await openNotebook(page, request);
  const responsePromise = page.waitForResponse("**/api/generate");
  await page.getByRole("button", { name: "Generate Infographic", exact: true }).click();
  const response = await responsePromise;
  expect(response.headers()["content-type"]).toContain("application/x-ndjson");
  const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  expect(events.filter((event) => event.event === "status").map((event) => event.status)).toEqual([
    "Preparing generation",
    "Reading selected sources",
    "Writing infographic",
    "Checking the generated content and citations",
    "Drawing the infographic",
    "Saving the generated artifact",
  ]);
  await expect(page.getByRole("dialog", { name: "Generation status" })).toBeHidden();
  await expect(page.locator("[data-infographic-style]").filter({ hasText: "Garden pilot at a glance" })).toBeVisible();
});

test("source transformations use a stacked generation modal", async ({ page, request }) => {
  await openNotebook(page, request);
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  await page.getByRole("button", { name: /^Field notes/ }).click();
  const source = page.getByRole("dialog", { name: "Field notes" });
  await expect(source).toBeVisible();
  const release = await heldFailure(page, "/api/transformations/apply");
  await source.getByRole("button", { name: "Apply → note", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Generation status" });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("heading", { name: "Dense summary", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(source).toBeVisible();
  await source.getByRole("button", { name: "View transformation generation status" }).click();
  release();
  await expect(modal.getByRole("alert")).toHaveText("Test generation quota exceeded");
});
