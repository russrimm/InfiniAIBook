import { expect, test, type Page } from "@playwright/test";

/**
 * How a new notebook explains itself: the getting-started steps follow the
 * notebook's state, Studio says why it is locked, settings stay folded until
 * asked for, and generated items live in Studio's Library.
 */

async function createNotebook(page: Page, withSource = false) {
  const res = await page.request.post("/api/notebooks", { data: { title: "Onboarding" } });
  const { id } = (await res.json()) as { id: string };
  if (withSource) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title: "Field notes", text: "Chlorophyll absorbs blue and red light. ".repeat(20) },
    });
  }
  return id;
}

test("an empty notebook walks through adding and choosing sources", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createNotebook(page);
  await page.goto(`/notebook/${id}`);

  const steps = page.getByRole("list", { name: "Getting started" });
  await expect(steps).toBeVisible();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Add sources");

  // Studio says why it is locked and where to go next.
  const studio = page.getByRole("complementary", { name: "Studio" });
  await expect(studio).toContainText("Add a source to start creating");
  await expect(studio.getByRole("button", { name: "Generate Report" })).toBeDisabled();

  await steps.getByRole("button", { name: "Add sources" }).click();
  // The first time, a walkthrough shows where things live; skipping it lands on upload.
  const tour = page.getByRole("dialog");
  await expect(tour).toContainText("Step 1 of 5");
  await tour.getByRole("button", { name: "Skip tour" }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.locator("#add-sources")).toBeFocused();

  await page.getByRole("button", { name: /Paste text/ }).click();
  await page.getByLabel("Title (optional)").fill("Field notes");
  await page.getByLabel("Text to add").fill("Chlorophyll absorbs blue and red light. ".repeat(20));
  await page.getByRole("button", { name: "Add source", exact: true }).click();

  await expect(page.getByText("Using 1 of 1 source").first()).toBeVisible({ timeout: 30_000 });
  await expect(steps.locator('[aria-current="step"]')).toContainText("Ask or create");

  // Unticking the only source makes choosing sources the current step again.
  await page.getByRole("checkbox", { name: /Field notes/ }).uncheck();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Choose which sources");
  await steps.getByRole("button", { name: "Use all sources" }).click();
  await expect(page.getByRole("checkbox", { name: /Field notes/ })).toBeChecked();
});

test("Studio folds settings behind Options and lists results in its Library", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createNotebook(page, true);
  await page.goto(`/notebook/${id}`);

  const studio = page.getByRole("complementary", { name: "Studio" });
  const audio = studio.getByTestId("audio-card");
  await expect(audio.getByLabel("Audio length")).toHaveCount(0);
  const options = audio.getByRole("button", { name: /^Options/ });
  await expect(options).toContainText("about 6 min");
  await options.click();
  await expect(options).toHaveAttribute("aria-expanded", "true");
  await expect(audio.getByLabel("Audio length")).toBeVisible();

  const library = studio.getByRole("button", { name: "Library (0)" });
  await library.click();
  await expect(studio).toContainText("Nothing generated yet");
  await studio.getByRole("button", { name: "Choose a format to create" }).click();
  await expect(studio.getByRole("button", { name: "Generate Report" })).toBeEnabled();
});

test("a chat is renamed in place and Escape cancels the edit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createNotebook(page, true);
  const session = await page.request.post(`/api/notebooks/${id}/sessions`, { data: {} });
  expect(session.ok()).toBeTruthy();
  await page.goto(`/notebook/${id}`);

  await page.getByRole("button", { name: "Rename this chat" }).click();
  const name = page.getByRole("textbox", { name: "Chat name" });
  await expect(name).toBeFocused();
  await name.fill("Ignored");
  await name.press("Escape");
  await expect(page.getByRole("combobox", { name: "Chat" })).not.toContainText("Ignored");

  await page.getByRole("button", { name: "Rename this chat" }).click();
  await page.getByRole("textbox", { name: "Chat name" }).fill("Light absorption");
  await page.getByRole("textbox", { name: "Chat name" }).press("Enter");
  await expect(page.getByRole("combobox", { name: "Chat" })).toContainText("Light absorption");
});

test("Add sources walks through the panels once, step by step", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createNotebook(page);
  await page.goto(`/notebook/${id}`);

  // Start with Sources folded away: Add sources must bring it back.
  await page.getByRole("button", { name: "Collapse Sources panel" }).click();
  await expect(page.getByRole("button", { name: "Expand Sources panel" })).toBeFocused();
  await expect(page.locator("#add-sources")).toBeHidden();

  const steps = page.getByRole("list", { name: "Getting started" });
  await steps.getByRole("button", { name: "Add sources" }).click();
  await expect(page.locator("#add-sources")).toBeVisible();

  const tour = page.getByRole("dialog");
  const titles = [
    "Pin or collapse Sources",
    "Add your sources here",
    "Studio is on the right",
    "Pin or collapse Studio",
    "Then ask your sources anything",
  ];
  for (const [i, title] of titles.entries()) {
    await expect(tour).toContainText(`Step ${i + 1} of ${titles.length}`);
    await expect(tour.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByTestId("tour-arrow")).toBeVisible();
    if (i === 1) {
      await tour.getByRole("button", { name: "Back" }).click();
      await expect(tour).toContainText("Step 1 of");
      await tour.getByRole("button", { name: "Next" }).click();
      await expect(tour).toContainText("Step 2 of");
    }
    if (i < titles.length - 1) await tour.getByRole("button", { name: "Next" }).click();
  }
  await tour.getByRole("button", { name: "Finish" }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.locator("#add-sources")).toBeFocused();

  // Once seen, Add sources goes straight to the upload control.
  await page.reload();
  await page.getByRole("list", { name: "Getting started" }).getByRole("button", { name: "Add sources" }).click();
  await expect(page.locator("#add-sources")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Help can replay it.
  await page.getByRole("button", { name: "Help and about" }).click();
  await page.getByRole("button", { name: "Show me around" }).click();
  await expect(page.getByRole("dialog")).toContainText("Step 1 of 5");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("side panels collapse, float when unpinned, and remember the choice", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createNotebook(page, true);
  await page.goto(`/notebook/${id}`);
  const sourcesHeading = page.getByRole("heading", { name: "Sources", exact: true });
  const pinSources = page.getByRole("button", { name: "Pin Sources panel" });

  // Unpinned, Sources floats over the chat and folds away on a click elsewhere.
  await expect(pinSources).toHaveAttribute("aria-pressed", "true");
  await pinSources.click();
  await expect(pinSources).toHaveAttribute("aria-pressed", "false");
  await expect(sourcesHeading).toBeVisible();
  await page.getByRole("textbox", { name: "Question" }).click();
  await expect(sourcesHeading).toBeHidden();

  // The rail brings it back; pinning docks it again.
  await page.getByRole("button", { name: /Open Sources/ }).click();
  await expect(sourcesHeading).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sourcesHeading).toBeHidden();
  await page.getByRole("button", { name: "Expand Sources panel" }).click();
  await pinSources.click();
  await expect(pinSources).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Question" }).click();
  await expect(sourcesHeading).toBeVisible();

  // Studio collapses to a rail that can open Studio or Notes.
  const studio = page.getByRole("complementary", { name: "Studio" });
  await page.getByRole("button", { name: "Collapse Studio panel" }).click();
  await expect(studio).toBeHidden();
  const rail = page.getByRole("navigation", { name: "Studio and Notes panel (collapsed)" });
  await rail.getByRole("button", { name: /Open Notes/ }).click();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse Studio panel" }).click();

  // The layout survives a reload.
  await page.reload();
  await expect(sourcesHeading).toBeVisible();
  await expect(studio).toBeHidden();
  await rail.getByRole("button", { name: "Open Studio" }).click();
  await expect(studio).toBeVisible();
});
