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
  await expect(page.locator("#add-sources")).toBeFocused();
  await page.getByRole("button", { name: "Pin sources panel", exact: true }).click();

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

for (const withSource of [false, true]) {
  test(`Sources starts collapsed ${withSource ? "with sources" : "in an empty notebook"} and can be pinned`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const id = await createNotebook(page, withSource);
    await page.goto(`/notebook/${id}`);

    const sources = page.getByRole("complementary", { name: "Sources", exact: true });
    const opener = page.locator("header").getByRole("button", { name: "Add sources", exact: true });
    const chat = page.getByRole("region", { name: "Chat", exact: true });
    await expect(sources).toBeHidden();
    await expect(opener).toHaveAttribute("aria-expanded", "false");
    const collapsedWidth = (await chat.boundingBox())!.width;

    await opener.click();
    await expect(sources).toBeVisible();
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#add-sources")).toBeFocused();
    expect((await chat.boundingBox())!.width).toBeLessThan(collapsedWidth);
    if (!withSource) {
      await chat.getByRole("button", { name: "Add sources", exact: true }).click();
      await expect(sources).toBeVisible();
    }

    await sources.getByRole("button", { name: "Pin sources panel", exact: true }).click();
    await expect(sources.getByRole("button", { name: "Unpin sources panel" })).toHaveAttribute("aria-pressed", "true");
    await chat.click({ position: { x: 20, y: 120 } });
    await page.keyboard.press("Escape");
    await expect(sources).toBeVisible();

    await sources.getByRole("button", { name: "Unpin sources panel" }).click();
    await expect(sources).toBeVisible();
    await chat.click({ position: { x: 20, y: 120 } });
    await expect(sources).toBeHidden();
    expect((await chat.boundingBox())!.width).toBe(collapsedWidth);

    await opener.click();
    await page.keyboard.press("Escape");
    await expect(sources).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.click();
    await sources.getByRole("button", { name: "Pin sources panel", exact: true }).click();
    await sources.getByRole("button", { name: "Collapse sources panel" }).click();
    await expect(sources).toBeHidden();
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(sources.getByRole("button", { name: "Pin sources panel", exact: true })).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(sources).toBeHidden();
  });
}

test("collapsing Sources preserves drafts and source dialogs do not dismiss it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createNotebook(page, true);
  await page.goto(`/notebook/${id}`);
  const opener = page.locator("header").getByRole("button", { name: "Add sources", exact: true });
  const sources = page.getByRole("complementary", { name: "Sources", exact: true });
  await opener.click();
  await sources.getByRole("button", { name: /Paste text/ }).click();
  await sources.getByLabel("Text to add").fill("An unfinished source");
  await sources.getByRole("button", { name: "Collapse sources panel" }).click();
  await opener.click();
  await expect(sources.getByLabel("Text to add")).toHaveValue("An unfinished source");
  await sources.getByLabel("Text to add").press("Escape");
  await expect(sources).toBeVisible();
  await sources.getByRole("button", { name: /^Field notes/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(sources).toBeVisible();
});

test("Sources is collapsed on mobile and opens through the header or panel tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createNotebook(page);
  await page.goto(`/notebook/${id}`);
  const sources = page.getByRole("complementary", { name: "Sources", exact: true });
  const panels = page.getByRole("navigation", { name: "Notebook panels" });
  await expect(sources).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("region", { name: "Chat", exact: true })).toBeVisible();
  await page.locator("header").getByRole("button", { name: "Add sources", exact: true }).click();
  await expect(sources).toBeVisible();
  await expect(page.locator("#add-sources")).toBeFocused();
  await panels.getByRole("button", { name: "chat", exact: true }).click();
  await expect(sources).toBeHidden();
  await panels.getByRole("button", { name: "sources", exact: true }).click();
  await panels.getByRole("button", { name: "sources", exact: true }).click();
  await expect(sources).toBeVisible();
  await sources.getByRole("button", { name: "Pin sources panel", exact: true }).click();
  await panels.getByRole("button", { name: "studio", exact: true }).click();
  await expect(sources).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(sources).toBeVisible();
  await sources.getByRole("button", { name: "Collapse sources panel" }).click();
  await expect(sources).toBeHidden();
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
