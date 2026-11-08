import { expect, test, type Page } from "@playwright/test";

const synopsis =
  "Chlorophyll absorbs blue and red light to power photosynthesis. These field notes explain how plants convert light into chemical energy, why leaves reflect green light, and how light conditions affect plant growth in the observations collected during the study.";

async function notebook(page: Page, count = 1) {
  const response = await page.request.post("/api/notebooks", { data: { title: "Source synopses" } });
  const { id } = (await response.json()) as { id: string };
  for (let i = 0; i < count; i++) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title: `Field notes ${i + 1}`, text: "Chlorophyll absorbs blue and red light. ".repeat(20) },
    });
  }
  await page.route(`**/api/notebooks/${id}`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.sources = body.sources.map((source: { summary: string | null }, i: number) => ({
      ...source,
      summary: i === 2 ? null : synopsis,
    }));
    await route.fulfill({ response: res, json: body });
  });
  return id;
}

test("Sources opens the added-source list with full synopses and no upload clutter", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const id = await notebook(page, 3);
  await page.goto(`/notebook/${id}`);
  const sources = page.getByRole("complementary", { name: "Sources", exact: true });
  const opener = page.getByRole("banner").getByRole("button", { name: "Sources (3)", exact: true });
  const list = page.getByRole("region", { name: "Source synopses" });
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(`/api/notebooks/${id}/sources`)) submissions++;
  });

  await expect(sources).toBeHidden();
  await opener.click();
  await expect(list).toBeFocused();
  await expect(sources.getByRole("button", { name: /Drop files/ })).toBeHidden();
  await expect(list.getByRole("checkbox")).toHaveCount(3);
  const summaries = list.getByText(synopsis, { exact: true });
  await expect(summaries).toHaveCount(2);
  expect(await summaries.first().evaluate((node) => getComputedStyle(node).webkitLineClamp)).toBe("none");
  expect((await list.boundingBox())!.height).toBeGreaterThan(300);
  await expect(list.getByText("No synopsis available.", { exact: true })).toBeVisible();

  await list.getByRole("checkbox", { name: /Field notes 2/ }).uncheck();
  await expect(page.getByText("Using 2 of 3 sources", { exact: true })).toBeVisible();
  await expect(list.getByRole("checkbox")).toHaveCount(3);
  await list.getByRole("button", { name: /^Field notes 1/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(sources).toBeVisible();
  await sources.getByRole("button", { name: "Collapse sources panel" }).click();
  await expect(opener).toBeFocused();
  expect(submissions).toBe(0);
});

test("switching between source synopses and upload tools preserves unfinished drafts", async ({ page }) => {
  const id = await notebook(page);
  await page.goto(`/notebook/${id}`);
  const banner = page.getByRole("banner");
  const sources = page.getByRole("complementary", { name: "Sources", exact: true });
  await banner.getByRole("button", { name: "Add sources", exact: true }).click();
  await sources.getByRole("button", { name: /Paste text/ }).click();
  await sources.getByLabel("Text to add").fill("An unfinished source");
  await banner.getByRole("button", { name: "Sources (1)", exact: true }).click();
  await expect(page.getByRole("region", { name: "Source synopses" })).toBeFocused();
  await expect(sources.getByLabel("Text to add")).toBeHidden();
  await sources.getByRole("button", { name: "Add sources", exact: true }).click();
  await expect(sources.getByLabel("Text to add")).toHaveValue("An unfinished source");
  await sources.getByRole("button", { name: "Hide upload tools", exact: true }).click();
  await expect(page.getByRole("region", { name: "Source synopses" })).toBeFocused();
});

test("the Sources header and mobile tab open the synopsis list without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await notebook(page);
  await page.goto(`/notebook/${id}`);
  const opener = page.getByRole("banner").getByRole("button", { name: "Sources (1)", exact: true });
  const list = page.getByRole("region", { name: "Source synopses" });
  await opener.click();
  await expect(list.getByText(synopsis, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const panels = page.getByRole("navigation", { name: "Notebook panels" });
  await panels.getByRole("button", { name: "chat", exact: true }).click();
  await expect(list).toBeHidden();
  await panels.getByRole("button", { name: /^sources/ }).click();
  await expect(list).toBeFocused();
  await expect(page.locator("#add-sources")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(panels.getByRole("button", { name: /^sources/ })).toBeFocused();
});
