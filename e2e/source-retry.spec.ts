import { expect, test } from "@playwright/test";

test("a source that failed to add can be retried without retyping it", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "Retry a source" } });
  const { id } = (await created.json()) as { id: string };

  let attempts = 0;
  await page.route(`**/api/notebooks/${id}/sources`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    if (attempts === 1) {
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "The provider could not be reached." }),
      });
    }
    return route.continue();
  });

  await page.goto(`/notebook/${id}`);
  const sources = page.getByRole("complementary", { name: "Sources", exact: true });
  await page.getByRole("banner").getByRole("button", { name: "Add sources", exact: true }).click();
  await sources.getByRole("button", { name: /Paste text/ }).click();
  await sources.getByLabel("Title (optional)").fill("Field notes");
  await sources.getByLabel("Text to add").fill("Chlorophyll absorbs blue and red light. ".repeat(20));
  await sources.getByRole("button", { name: "Add source", exact: true }).click();

  const list = page.getByRole("region", { name: "Source synopses" });
  await expect(list.getByText("The provider could not be reached.")).toBeVisible();
  await expect(list.getByRole("checkbox")).toHaveCount(0);

  await list.getByRole("button", { name: "Try adding Field notes again" }).click();
  await expect(list.getByRole("checkbox", { name: /Field notes/ })).toBeVisible();
  await expect(list.getByText("The provider could not be reached.")).toHaveCount(0);
  expect(attempts).toBe(2);
});
