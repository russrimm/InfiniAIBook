import { expect, test } from "@playwright/test";

test("the source reader can find text, step through matches and clear with Escape", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "Find in source" } });
  const { id } = (await created.json()) as { id: string };
  const filler = "Plants turn sunlight into stored sugar. ".repeat(60);
  await page.request.post(`/api/notebooks/${id}/sources`, {
    data: {
      title: "Long report",
      text: `Chlorophyll opens the report. ${filler}\n\nMid-report: chlorophyll absorbs red light. ${filler}\n\nClosing: CHLOROPHYLL again.`,
    },
  });

  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: "Sources (1)", exact: true }).click();
  await page.getByRole("region", { name: "Source synopses" }).getByRole("button", { name: /Long report/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Long report" });
  const find = dialog.getByRole("searchbox", { name: "Find" });
  await expect(find).toBeVisible();

  await find.fill("chlorophyll");
  await expect(dialog.getByText("1 of 3")).toBeVisible();
  await expect(dialog.locator("mark.find-match")).toHaveCount(3);
  await expect(dialog.locator("mark.find-current")).toHaveCount(1);

  await find.press("Enter");
  await expect(dialog.getByText("2 of 3")).toBeVisible();
  await expect(dialog.locator("mark.find-current")).toContainText("chlorophyll");
  await expect(dialog.locator("mark.find-current")).toBeInViewport();

  await dialog.getByRole("button", { name: "Next match" }).click();
  await expect(dialog.getByText("3 of 3")).toBeVisible();
  await expect(dialog.locator("mark.find-current")).toHaveText("CHLOROPHYLL");
  await find.press("Enter");
  await expect(dialog.getByText("1 of 3")).toBeVisible();
  await dialog.getByRole("button", { name: "Previous match" }).click();
  await expect(dialog.getByText("3 of 3")).toBeVisible();

  await find.fill("no such phrase");
  await expect(dialog.getByText("No matches")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Next match" })).toBeDisabled();

  // Escape clears the search first, and only then closes the reader.
  await find.fill("sugar");
  await find.press("Escape");
  await expect(find).toHaveValue("");
  await expect(dialog.locator("mark.find-match")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await find.press("Escape");
  await expect(dialog).toBeHidden();
});
