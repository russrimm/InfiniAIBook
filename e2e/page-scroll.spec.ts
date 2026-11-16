import { expect, test, type Page } from "@playwright/test";

async function notebook(page: Page, count: number) {
  const response = await page.request.post("/api/notebooks", { data: { title: "Page scroll" } });
  const { id } = (await response.json()) as { id: string };
  for (let i = 1; i <= count; i++) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title: `Field notes ${i}`, text: `Chlorophyll absorbs blue and red light, part ${i}. `.repeat(20) },
    });
  }
  return id;
}

const documentFits = (page: Page) =>
  page.evaluate(() => {
    const root = document.scrollingElement!;
    return { scrollHeight: root.scrollHeight, innerHeight: window.innerHeight, scrollY: window.scrollY };
  });

async function expectFixedPage(page: Page) {
  const { scrollHeight, innerHeight } = await documentFits(page);
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  // Try every way a person can scroll the page itself, away from the panes.
  await page.mouse.move(5, 5);
  await page.mouse.wheel(0, 3000);
  await page.keyboard.press("PageDown");
  await page.keyboard.press("End");
  await page.waitForTimeout(150);
  expect((await documentFits(page)).scrollY).toBe(0);
  expect((await page.getByRole("banner").boundingBox())?.y).toBe(0);
}

for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
  test(`the notebook page never scrolls itself at ${name} width`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const id = await notebook(page, 30);
    await page.goto(`/notebook/${id}`);
    await expect(page.getByRole("banner")).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Notebook panels" });

    await expectFixedPage(page);
    // Sources, Studio and Notes each keep the document still too.
    if (width < 1024) {
      for (const tab of ["studio", "notes", "chat"]) {
        await tabs.getByRole("button", { name: new RegExp(`^${tab}`) }).click();
        await expectFixedPage(page);
      }
      await tabs.getByRole("button", { name: /^sources/ }).click();
    } else {
      await page.getByRole("button", { name: "notes", exact: true }).click();
      await expectFixedPage(page);
      await page.getByRole("button", { name: "studio", exact: true }).click();
      await expectFixedPage(page);
      await page.getByRole("banner").getByRole("button", { name: "Sources (30)", exact: true }).click();
    }

    // A long Sources list scrolls inside its own pane.
    const list = page.getByRole("region", { name: "Source synopses" });
    await expect(list.getByRole("checkbox")).toHaveCount(30);
    const box = await list.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expectFixedPage(page);
    expect((await documentFits(page)).scrollY).toBe(0);
  });
}

test("the notebook page stays fixed in a short, keyboard-sized viewport and keeps the chat input visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  const id = await notebook(page, 12);
  await page.goto(`/notebook/${id}`);
  await expect(page.getByRole("banner")).toBeVisible();
  await expectFixedPage(page);
  const input = page.getByRole("textbox", { name: "Question" });
  await expect(input).toBeVisible();
  const bottom = ((await input.boundingBox())?.y ?? 0) + ((await input.boundingBox())?.height ?? 0);
  expect(bottom).toBeLessThanOrEqual(400);
});

test("other pages still scroll when their content is taller than the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  const { scrollHeight, innerHeight } = await documentFits(page);
  expect(scrollHeight).toBeGreaterThan(innerHeight);
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await documentFits(page)).scrollY).toBeGreaterThan(0);
});
