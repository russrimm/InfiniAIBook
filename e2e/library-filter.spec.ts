import { expect, test } from "@playwright/test";

test("the Library can be filtered once it grows", async ({ page }) => {
  test.setTimeout(120_000);
  const created = await page.request.post("/api/notebooks", { data: { title: "Library filter" } });
  const { id } = (await created.json()) as { id: string };
  await page.request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Field notes", text: "Chlorophyll absorbs blue and red light. ".repeat(20) },
  });
  const sourceIds = ((await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { id: string }[] }).sources.map((s) => s.id);
  const titles = ["Soil overview", "River flow", "Leaf pigments", "Bird songs", "Weather logs", "Tree rings", "Moss survey"];
  for (const title of titles) {
    const made = await page.request.post("/api/generate", {
      data: { notebookId: id, type: "infographic", sourceIds, title },
    });
    expect(made.status()).toBe(200);
  }

  await page.goto(`/notebook/${id}`);
  const studio = page.getByRole("complementary", { name: "Studio" });
  await studio.getByRole("button", { name: `Library (${titles.length})` }).click();
  const filter = studio.getByRole("searchbox", { name: "Filter Library" });
  await expect(studio.getByRole("button", { name: /^Delete / })).toHaveCount(titles.length);

  await filter.fill("river");
  await expect(studio.getByRole("button", { name: /^Delete / })).toHaveCount(1);
  await expect(studio.getByRole("button", { name: "Delete River flow" })).toBeVisible();
  await expect(studio.getByText("Showing 1 of 7.")).toBeVisible();

  // The format name matches too, so every infographic stays when it is typed.
  await filter.fill("infographic");
  await expect(studio.getByRole("button", { name: /^Delete / })).toHaveCount(titles.length);

  await filter.fill("nothing like this");
  await expect(studio.getByText(/Nothing in the Library matches/)).toBeVisible();
  await studio.getByRole("button", { name: "Clear filter" }).click();
  await expect(filter).toHaveValue("");
  await expect(studio.getByRole("button", { name: /^Delete / })).toHaveCount(titles.length);
});

test("a short Library has no filter box", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "Short library" } });
  const { id } = (await created.json()) as { id: string };
  await page.request.post(`/api/notebooks/${id}/sources`, { data: { title: "Doc", text: "Plants use light. ".repeat(20) } });
  const sourceIds = ((await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { id: string }[] }).sources.map((s) => s.id);
  await page.request.post("/api/generate", { data: { notebookId: id, type: "infographic", sourceIds, title: "Only one" } });
  await page.goto(`/notebook/${id}`);
  const studio = page.getByRole("complementary", { name: "Studio" });
  await studio.getByRole("button", { name: "Library (1)" }).click();
  await expect(studio.getByRole("button", { name: "Delete Only one" })).toBeVisible();
  await expect(studio.getByRole("searchbox", { name: "Filter Library" })).toHaveCount(0);
});
