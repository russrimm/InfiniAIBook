import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";

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

  // Everything but the style sits behind Options until asked for.
  await expect(card.getByRole("button", { name: /Suggest styles/ })).toHaveCount(0);
  await card.getByRole("button", { name: /^Options/ }).click();
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

  await expect(card.getByRole("button", { name: /^Options/ })).toHaveAttribute("aria-expanded", "true");
  await card.getByRole("button", { name: "Generate Infographic" }).click();

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
  const notebook = await (await request.get(`/api/notebooks/${id}`)).json() as { sources: { id: string }[] };
  const sourceIds = notebook.sources.map((source) => source.id);
  expect(sourceIds).toHaveLength(1);
  const bad = await request.post("/api/generate", {
    data: { notebookId: id, sourceIds, type: "infographic", style: "constructor" },
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toContain("Unknown infographic style");
  const long = await request.post("/api/generate", {
    data: { notebookId: id, sourceIds, type: "infographic", style: "timeline", instructions: "x".repeat(601) },
  });
  expect(long.status()).toBe(400);
  expect((await long.json()).error).toContain("Keep the description under 600 characters.");
  const proto = await request.post("/api/generate", {
    data: { notebookId: id, sourceIds, type: "__proto__" },
  });
  expect(proto.status()).toBe(400);
  expect((await proto.json()).error).toBe("Unknown artifact type");

  const tooLong = await request.post("/api/generate", {
    data: { notebookId: id, sourceIds, type: "infographic", style: "timeline", title: "x".repeat(81) },
  });
  expect(tooLong.status()).toBe(400);
  expect((await tooLong.json()).error).toContain("Keep the title under 80 characters.");
  const notText = await request.post("/api/generate", {
    data: { notebookId: id, sourceIds, type: "infographic", style: "timeline", title: 7 },
  });
  expect(notText.status()).toBe(400);
});

test("a typed title is the headline, Library name and download name, and survives regenerating", async ({
  page,
  request,
}) => {
  const id = await notebookWithSource(request);
  const card = await openStudio(page, id);
  const studio = page.getByRole("complementary", { name: "Studio" });
  await card.getByRole("button", { name: /^Options/ }).click();

  const title = card.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveAttribute("maxlength", "80");
  await expect(card).toContainText("Leave blank to generate a title from your content");
  await expect(title).toHaveAccessibleDescription(/Leave blank to generate a title/);
  await title.fill("  <b>Riverside</b>   Garden: \"Plan\" ");
  await expect(card).toContainText("/80");

  const generate = async () => {
    await card.getByRole("button", { name: "Generate Infographic" }).click();
    const dialog = page.getByRole("dialog").filter({ has: page.locator("[data-infographic-style]") });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    return dialog;
  };

  const dialog = await generate();
  await expect(dialog.getByRole("heading", { level: 1 })).toHaveText('<b>Riverside</b> Garden: "Plan"');
  await expect(dialog.locator("#artifact-title")).toHaveText('<b>Riverside</b> Garden: "Plan"');
  await expect(dialog.locator("b")).toHaveCount(0);
  const sent = (await (await request.get(`${MOCK_LLM}/last`)).json()) as { system: string };
  expect(sent.system).toContain("FIXED TITLE");
  expect(sent.system).toContain('<b>Riverside</b> Garden: "Plan"');

  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  expect((await download).suggestedFilename()).toBe("bRiversideb Garden Plan.md");
  await dialog.getByRole("button", { name: "Close" }).click();

  // Regenerating keeps the typed title.
  await expect(title).toHaveValue('<b>Riverside</b> Garden: "Plan"');
  await (await generate()).getByRole("button", { name: "Close" }).click();
  await studio.getByRole("button", { name: "Library (2)" }).click();
  await expect(studio.getByText('<b>Riverside</b> Garden: "Plan"')).toHaveCount(2);

  // Clearing it hands the title back to the model.
  await studio.getByRole("button", { name: /^Create/ }).click();
  const options = card.getByRole("button", { name: /^Options/ });
  if ((await options.getAttribute("aria-expanded")) !== "true") await options.click();
  await expect(title).toHaveValue('<b>Riverside</b> Garden: "Plan"');
  await title.fill("");
  const generated = await generate();
  await expect(generated.getByRole("heading", { level: 1 })).toHaveText("Garden pilot at a glance");
  const blank = (await (await request.get(`${MOCK_LLM}/last`)).json()) as { system: string };
  expect(blank.system).not.toContain("FIXED TITLE");
});

test("the Title field fits a phone-width Studio", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await notebookWithSource(request);
  await page.goto(`/notebook/${id}`);
  await page.getByRole("navigation", { name: "Notebook panels" }).getByRole("button", { name: /^studio/i }).click();
  const card = page.getByTestId("infographic-card");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /^Options/ }).click();
  const title = card.getByRole("textbox", { name: "Title" });
  await title.fill("w".repeat(80));
  const box = (await title.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

const SPECIAL_TITLE = "Q3 🌱 plan: \"wins\" / <b>risks</b> * مشروع";

for (const style of ["bento", "guide"]) {
  // "guide" is drawn by the image model, so its PNG is fetched from /api/image;
  // the others are rasterized in the browser.
  test(`exports the ${style} infographic as PNG and Markdown`, async ({ page, request }) => {
    const id = await notebookWithSource(request);
    const nb = (await (await request.get(`/api/notebooks/${id}`)).json()) as { sources: { id: string }[] };
    await request.post(`${MOCK_LLM}/faults`, { data: { images: style === "guide", reset: true } });
    try {
      const made = await request.post("/api/generate", {
        data: { notebookId: id, sourceIds: nb.sources.map((s) => s.id), type: "infographic", style, title: SPECIAL_TITLE },
      });
      expect(made.ok()).toBeTruthy();
      const artifact = (await made.json()) as { title: string; content: { imageUrl?: string } };
      expect(Boolean(artifact.content.imageUrl)).toBe(style === "guide");

      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(`/notebook/${id}`);
      await page.getByRole("complementary", { name: "Studio" }).getByRole("button", { name: /^Library/ }).click();
      const row = page.getByRole("button", { name: new RegExp(`^${SPECIAL_TITLE.slice(0, 8)}`) }).first();
      await expect(row).toContainText(style === "bento" ? "Infographic · Bento grid · " : "Infographic · Visual guide · ");
      await row.click();
      const dialog = page.getByRole("dialog").filter({ has: page.locator("[data-infographic-style]") });
      await expect(dialog).toBeVisible();

      const png = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "PNG" }).click();
      const file = await png;
      expect(file.suggestedFilename()).toBe("Q3 🌱 plan wins brisksb مشروع.png");
      expect(file.failure()).resolves.toBeNull();
      const bytes = fs.readFileSync((await file.path())!);
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      if (style === "bento") expect(bytes.length).toBeGreaterThan(5000);
      await expect(dialog.getByRole("alert")).toHaveCount(0);

      const md = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Export" }).click();
      expect((await md).suggestedFilename()).toBe("Q3 🌱 plan wins brisksb مشروع.md");
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      expect(errors.filter((e) => /Content Security Policy|Failed to fetch/i.test(e))).toEqual([]);
    } finally {
      await request.post(`${MOCK_LLM}/faults`, { data: { images: false, reset: true } });
    }
  });
}

test("a long Library subtitle stays inside the row at phone width", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await notebookWithSource(request);
  const nb = (await (await request.get(`/api/notebooks/${id}`)).json()) as { sources: { id: string }[] };
  const made = await request.post("/api/generate", {
    data: { notebookId: id, sourceIds: nb.sources.map((s) => s.id), type: "infographic", style: "papercraft", title: "w".repeat(80) },
  });
  expect(made.ok()).toBeTruthy();
  await page.goto(`/notebook/${id}`);
  await page.getByRole("navigation", { name: "Notebook panels" }).getByRole("button", { name: /^studio/i }).click();
  await page.getByRole("button", { name: /^Library/ }).click();
  // The image model is not configured here, so the brief is kept as Illustrated.
  const row = page.getByRole("button", { name: /^w{20}/ });
  await expect(row).toContainText("Infographic · Illustrated · ");
  await expect(row).toHaveAttribute("title", /^w{80} — Infographic · Illustrated · /);
  const box = (await row.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
