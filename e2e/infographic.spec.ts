import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The infographic style gallery and generation options, in a real browser,
 * against the real /api/generate and /api/infographic/suggest routes backed by
 * e2e/mock-llm.mjs. The mock has no image endpoint, so picking an image style
 * also exercises the fallback that keeps the brief when the picture fails.
 */

const MOCK_LLM = `http://127.0.0.1:${Number(process.env.MOCK_LLM_PORT || 3124)}`;

async function notebookWithSource(request: APIRequestContext): Promise<string> {
  const nb = await request.post("/api/notebooks", { data: { title: "Garden pilot" } });
  expect(nb.ok()).toBeTruthy();
  const { id } = (await nb.json()) as { id: string };
  const src = await request.post(`/api/notebooks/${id}/sources`, {
    data: {
      title: "Garden notes",
      text:
        "The Riverside garden pilot builds 24 raised beds in April 2025. " +
        "In March 2025 two workshops brought 38 volunteers; 12 took weekly shifts. " +
        "A drip kit costs $640 and uses about 40% less water than hand watering.",
    },
  });
  expect(src.ok()).toBeTruthy();
  return id;
}

async function openStudio(page: Page, id: string) {
  await page.goto(`/notebook/${id}`);
  const card = page.getByTestId("infographic-card");
  await expect(card).toBeVisible();
  return card;
}

test("shows an example of every style before generating", async ({ page, request }) => {
  const id = await notebookWithSource(request);
  const card = await openStudio(page, id);

  await card.getByRole("button", { name: /Browse all \d+ styles/ }).click();
  const dialog = page.getByRole("dialog", { name: "Infographic styles" });
  await expect(dialog).toBeVisible();

  const thumbs = dialog.locator("button[data-style]");
  await expect(thumbs).toHaveCount(33);

  // Every thumbnail is a real rendering, not a placeholder.
  await expect(dialog.locator("button[data-style] [data-infographic-style]").first()).toBeVisible();

  await dialog.locator('button[data-style="timeline"]').click();
  await expect(dialog.getByRole("heading", { name: /Timeline/ })).toBeVisible();
  const preview = dialog.locator('[data-infographic-style="timeline"]').last();
  await expect(preview).toContainText("Build day");
  await expect(preview).toContainText("Riverside Garden Pilot");

  // Image styles show a labeled layout sketch instead of spending an image call.
  await dialog.locator('button[data-style="anime"]').click();
  await expect(dialog.getByText("Needs an image model")).toBeVisible();
  await expect(dialog.getByText(/Layout sketch/).last()).toBeVisible();

  // Filtering narrows the grid.
  await dialog.getByRole("tab", { name: "Drawn by AI" }).click();
  await expect(thumbs).toHaveCount(5);
  await dialog.getByRole("tab", { name: "All" }).click();
  await dialog.getByRole("searchbox", { name: "Search styles" }).fill("myth");
  await expect(thumbs).toHaveCount(1);

  await thumbs.first().click();
  await dialog.getByRole("button", { name: "Use this style" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Myth vs fact");
});

test("suggests styles, then generates with orientation and a description", async ({
  page,
  request,
}) => {
  const id = await notebookWithSource(request);
  const card = await openStudio(page, id);

  await card.getByRole("button", { name: /Suggest styles/ }).click();
  await expect(card.getByRole("button", { name: /Timeline/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /Funnel/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /Myth vs fact/ })).toBeVisible();
  await card.getByRole("button", { name: /Timeline/ }).click();

  await card.getByRole("radio", { name: "Portrait" }).click();
  await card.getByRole("combobox", { name: "Level of detail" }).selectOption("concise");
  await card.getByRole("button", { name: /Describe the infographic/ }).click();
  await card.getByRole("textbox", { name: /Describe the infographic/ }).fill(
    "For new volunteers; focus on the schedule."
  );

  await card.getByRole("button", { name: /^📊 Infographic/ }).click();

  const modal = page.locator("[data-infographic-style]").filter({ hasText: "Garden pilot at a glance" });
  await expect(modal).toBeVisible({ timeout: 30_000 });
  await expect(modal).toHaveAttribute("data-infographic-style", "timeline");
  await expect(modal).toContainText("Workshops");
  await expect(modal).toContainText("Build day");

  const sent = (await (await request.get(`${MOCK_LLM}/last`)).json()) as { system: string };
  expect(sent.system).toContain("STYLE: Timeline");
  expect(sent.system).toContain("FRAME: portrait");
  expect(sent.system).toContain("DETAIL: concise");
  expect(sent.system).toContain("For new volunteers; focus on the schedule.");
});

test("keeps the brief as Illustrated when the image cannot be drawn", async ({
  page,
  request,
}) => {
  const id = await notebookWithSource(request);
  const card = await openStudio(page, id);

  await card.getByRole("button", { name: /Browse all \d+ styles/ }).click();
  const dialog = page.getByRole("dialog", { name: "Infographic styles" });
  await dialog.locator('button[data-style="papercraft"]').click();
  await dialog.getByRole("button", { name: "Generate" }).click();

  const art = page.locator("[data-infographic-style]").filter({ hasText: "Garden pilot at a glance" });
  await expect(art).toBeVisible({ timeout: 60_000 });
  await expect(art).toContainText("Shown as Illustrated");
  await expect(art).toContainText("Paper craft");
});

test("rejects unknown styles and oversized descriptions", async ({ request }) => {
  const id = await notebookWithSource(request);
  const bad = await request.post("/api/generate", {
    data: { notebookId: id, type: "infographic", style: "constructor" },
  });
  expect(bad.status()).toBe(400);
  const long = await request.post("/api/generate", {
    data: { notebookId: id, type: "infographic", style: "timeline", instructions: "x".repeat(601) },
  });
  expect(long.status()).toBe(400);
  const proto = await request.post("/api/generate", {
    data: { notebookId: id, type: "__proto__" },
  });
  expect(proto.status()).toBe(400);
});
