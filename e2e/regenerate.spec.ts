import { expect, test, type Page } from "@playwright/test";

async function notebookWithInfographics(page: Page, titles: string[]) {
  const created = await page.request.post("/api/notebooks", { data: { title: "Regenerate" } });
  const { id } = (await created.json()) as { id: string };
  await page.request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Field notes", text: "Chlorophyll absorbs blue and red light. ".repeat(20) },
  });
  const sourceIds = ((await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { id: string }[] }).sources.map((s) => s.id);
  for (const title of titles) {
    const made = await page.request.post("/api/generate", { data: { notebookId: id, type: "infographic", sourceIds, title } });
    expect(made.status()).toBe(200);
    await page.waitForTimeout(20); // distinct creation times
  }
  return id;
}

const artifactTitles = async (page: Page, id: string) =>
  ((await (await page.request.get(`/api/notebooks/${id}`)).json()) as { artifacts: { id: string; title: string }[] }).artifacts;

test("the Library sorts by date, name or format and remembers the choice", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await notebookWithInfographics(page, ["Zebra facts", "Apple facts", "Mango facts"]);
  await page.goto(`/notebook/${id}`);
  const studio = page.getByRole("complementary", { name: "Studio" });
  await studio.getByRole("button", { name: "Library (3)" }).click();
  const order = async () =>
    (await studio.getByRole("button", { name: /^Delete / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).map((l) => String(l).replace("Delete ", ""));

  expect(await order()).toEqual(["Mango facts", "Apple facts", "Zebra facts"]);
  const sort = studio.getByRole("combobox", { name: "Sort" });
  await sort.selectOption("oldest");
  expect(await order()).toEqual(["Zebra facts", "Apple facts", "Mango facts"]);
  await sort.selectOption("name");
  expect(await order()).toEqual(["Apple facts", "Mango facts", "Zebra facts"]);

  await page.reload();
  await studio.getByRole("button", { name: "Library (3)" }).click();
  await expect(studio.getByRole("combobox", { name: "Sort" })).toHaveValue("name");
  expect(await order()).toEqual(["Apple facts", "Mango facts", "Zebra facts"]);
});

test("regenerates with a changed focus, keeping the original or replacing it only when asked", async ({ page }) => {
  test.setTimeout(180_000);
  const id = await notebookWithInfographics(page, ["Apple facts"]);
  const before = (await artifactTitles(page, id))[0].id;
  await page.goto(`/notebook/${id}`);
  const studio = page.getByRole("complementary", { name: "Studio" });
  await studio.getByRole("button", { name: "Library (1)" }).click();
  await studio.getByRole("button", { name: /^Apple facts/ }).first().click();

  const modal = page.getByRole("dialog", { name: "Apple facts" });
  await modal.getByRole("button", { name: "Regenerate…" }).click();
  const dialog = page.getByRole("dialog", { name: "Regenerate Infographic" });
  await expect(dialog).toContainText("from the 1 source");
  await expect(dialog.getByText(/Estimated cost/)).toBeVisible();
  await dialog.getByRole("textbox", { name: "Focus or instruction" }).fill("only the colors");

  // The default keeps the original.
  await expect(dialog.getByRole("radio", { name: /Keep it/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Regenerate as a new version" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await artifactTitles(page, id)).length).toBe(2);
  const kept = await artifactTitles(page, id);
  expect(kept.map((a) => a.id)).toContain(before);

  // Replace: the one being redone goes away, the new one stays.
  await page.getByRole("dialog", { name: "Apple facts" }).getByRole("button", { name: "Regenerate…" }).click();
  const again = page.getByRole("dialog", { name: "Regenerate Infographic" });
  await expect(again.getByRole("textbox", { name: "Focus or instruction" })).toHaveValue("only the colors");
  await again.getByRole("radio", { name: /Replace it/ }).check();
  await again.getByRole("button", { name: "Regenerate and replace" }).click();
  await expect(again).toBeHidden();
  await expect.poll(async () => (await artifactTitles(page, id)).length).toBe(2);
  const finalIds = (await artifactTitles(page, id)).map((a) => a.id);
  expect(finalIds.filter((x) => kept.map((k) => k.id).includes(x))).toHaveLength(1);
});
