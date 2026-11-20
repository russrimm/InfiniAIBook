import { expect, test } from "@playwright/test";

async function notebook(page: import("@playwright/test").Page, titles: string[]) {
  const created = await page.request.post("/api/notebooks", { data: { title: "Manage sources" } });
  const { id } = (await created.json()) as { id: string };
  for (const title of titles) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title, text: `${title} describes how chlorophyll absorbs blue and red light. `.repeat(10) },
    });
  }
  return id;
}

test("a source can be renamed and the list filtered once it grows", async ({ page }) => {
  const titles = ["Leaf pigments", "Soil chemistry", "River flow", "Bird songs", "Weather logs", "Tree rings", "Moss survey"];
  const id = await notebook(page, titles);
  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: `Sources (${titles.length})`, exact: true }).click();
  const list = page.getByRole("region", { name: "Source synopses" });
  await expect(list.getByRole("checkbox")).toHaveCount(titles.length);

  // Rename: Escape cancels, Enter saves, and the list shows the new name.
  await list.getByRole("button", { name: "Rename source Bird songs" }).click();
  const field = list.getByRole("textbox", { name: "Source name" });
  await field.fill("Discarded");
  await field.press("Escape");
  await expect(list.getByRole("checkbox", { name: /Bird songs/ })).toBeVisible();
  await expect(list.getByRole("button", { name: "Rename source Bird songs" })).toBeFocused();

  await list.getByRole("button", { name: "Rename source Bird songs" }).click();
  await field.fill("Dawn chorus recordings");
  await field.press("Enter");
  await expect(list.getByRole("checkbox", { name: /Dawn chorus recordings/ })).toBeVisible();
  await expect(list.getByRole("checkbox", { name: /Bird songs/ })).toHaveCount(0);

  // The new name is what the API (and so chat citations and exports) now reports.
  const renamed = (await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { title: string }[] };
  expect(renamed.sources.map((s) => s.title)).toContain("Dawn chorus recordings");

  // A blank name is refused with a message and nothing changes.
  await list.getByRole("button", { name: "Rename source River flow" }).click();
  await field.fill("   ");
  await field.press("Enter");
  await expect(list.getByText("Give the source a name.")).toBeVisible();
  await field.press("Escape");

  // Filter.
  const filter = page.getByRole("searchbox", { name: "Filter sources" });
  await filter.fill("soil");
  await expect(list.getByRole("checkbox")).toHaveCount(1);
  await expect(list.getByRole("checkbox", { name: /Soil chemistry/ })).toBeVisible();
  await expect(list.getByText("Showing 1 of 7 sources")).toBeVisible();
  await filter.fill("nothing like this");
  await expect(list.getByText(/No source matches/)).toBeVisible();
  await filter.fill("");
  await expect(list.getByRole("checkbox")).toHaveCount(titles.length);
});

test("a short list has no filter box", async ({ page }) => {
  const id = await notebook(page, ["One", "Two"]);
  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: "Sources (2)", exact: true }).click();
  await expect(page.getByRole("region", { name: "Source synopses" }).getByRole("checkbox")).toHaveCount(2);
  await expect(page.getByRole("searchbox", { name: "Filter sources" })).toHaveCount(0);
});
