import { expect, test, type Page } from "@playwright/test";

async function notebook(page: Page, count: number) {
  const response = await page.request.post("/api/notebooks", { data: { title: "Delete several sources" } });
  const { id } = (await response.json()) as { id: string };
  for (let i = 1; i <= count; i++) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title: `Field notes ${i}`, text: `Chlorophyll absorbs blue and red light, part ${i}. `.repeat(20) },
    });
  }
  return id;
}

for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
  test(`deleting several sources in a row keeps Sources open at ${name} width`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const id = await notebook(page, 4);
    await page.goto(`/notebook/${id}`);
    const sources = page.getByRole("complementary", { name: "Sources", exact: true });
    const list = page.getByRole("region", { name: "Source synopses" });
    if (width < 1024) {
      await page.getByRole("navigation", { name: "Notebook panels" }).getByRole("button", { name: /^sources/ }).click();
    } else {
      await page.getByRole("banner").getByRole("button", { name: "Sources (4)", exact: true }).click();
    }
    await expect(list.getByRole("checkbox")).toHaveCount(4);

    await list.getByRole("button", { name: "Remove source Field notes 2" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Field notes 2” deleted" })).toBeVisible();
    await expect(list.getByRole("checkbox")).toHaveCount(3);
    await expect(sources).toBeVisible();
    // Focus lands on the next source's delete control, not on the page.
    await expect(list.getByRole("button", { name: "Remove source Field notes 3" })).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(list.getByRole("checkbox")).toHaveCount(2);
    await expect(sources).toBeVisible();
    await expect(list.getByRole("button", { name: "Remove source Field notes 4" })).toBeFocused();

    await list.getByRole("button", { name: "Remove source Field notes 4" }).click();
    await expect(list.getByRole("checkbox")).toHaveCount(1);
    await expect(sources).toBeVisible();
    // The last row has no successor, so focus falls back to the previous one.
    await expect(list.getByRole("button", { name: "Remove source Field notes 1" })).toBeFocused();
    await expect(list.getByRole("checkbox", { name: /Field notes 1/ })).toBeVisible();

    // Undo from the toast still restores the latest deletion and keeps the panel open.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(list.getByRole("checkbox")).toHaveCount(2);
    await expect(sources).toBeVisible();
  });
}

test("toggling checkboxes keeps Sources open on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await notebook(page, 3);
  await page.goto(`/notebook/${id}`);
  await page.getByRole("navigation", { name: "Notebook panels" }).getByRole("button", { name: /^sources/ }).click();
  const list = page.getByRole("region", { name: "Source synopses" });
  await list.getByRole("checkbox", { name: /Field notes 1/ }).uncheck();
  await list.getByRole("checkbox", { name: /Field notes 2/ }).uncheck();
  await expect(list).toBeVisible();
  await expect(list.getByRole("checkbox", { checked: true })).toHaveCount(1);
});
