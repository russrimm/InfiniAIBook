import { expect, test, type Page } from "@playwright/test";

/** Notebooks share one database across specs, so every title carries a prefix unique to this file. */
const PREFIX = "Listing";

async function seed(page: Page, titles: string[]) {
  const ids: string[] = [];
  for (const title of titles) {
    const res = await page.request.post("/api/notebooks", { data: { title: `${PREFIX} ${title}` } });
    ids.push(((await res.json()) as { id: string }).id);
  }
  return ids;
}

test("a long notebook list can be searched, sorted and renamed in place", async ({ page }) => {
  const [first] = await seed(page, ["Zebra herds", "Moss survey", "Tide tables", "Bird songs", "Weather logs", "Tree rings"]);
  // A source makes the first notebook the one with the most sources and the latest activity.
  await page.request.post(`/api/notebooks/${first}/sources`, {
    data: { title: "Herd counts", text: "Zebra herds were counted at dawn. ".repeat(10) },
  });
  await page.goto("/");

  const heading = page.getByRole("heading", { name: /^Your notebooks/ });
  await expect(heading).toBeVisible();
  const links = page.getByRole("list").getByRole("link", { name: new RegExp(`^${PREFIX} `) });

  // Search narrows the list and says how many of the total remain.
  const search = page.getByRole("searchbox", { name: "Search notebooks" });
  await search.fill(`${PREFIX} tide`);
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveText(`${PREFIX} Tide tables`);
  await expect(heading).toHaveText(/Your notebooks · 1 of \d+/);
  await search.fill(`${PREFIX} no such notebook`);
  await expect(page.getByText(/No notebook matches/)).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await search.fill(PREFIX);
  await expect(links).toHaveCount(6);

  // Sorting by name is alphabetical, and the choice survives a reload.
  await page.getByLabel("Sort").selectOption("name");
  await expect(links.first()).toHaveText(`${PREFIX} Bird songs`);
  await expect(links.last()).toHaveText(`${PREFIX} Zebra herds`);
  await page.reload();
  await expect(page.getByLabel("Sort")).toHaveValue("name");
  await page.getByRole("searchbox", { name: "Search notebooks" }).fill(PREFIX);
  await expect(links.first()).toHaveText(`${PREFIX} Bird songs`);

  // Most sources puts the notebook that has one first; recently active does too.
  await page.getByLabel("Sort").selectOption("sources");
  await expect(links.first()).toHaveText(`${PREFIX} Zebra herds`);
  await page.getByLabel("Sort").selectOption("recent");
  await expect(links.first()).toHaveText(`${PREFIX} Zebra herds`);

  // Rename: Escape cancels, a blank name is refused, Enter saves.
  await page.getByLabel("Sort").selectOption("name");
  const rename = page.getByRole("button", { name: `Rename notebook ${PREFIX} Moss survey` });
  await rename.click();
  const field = page.getByRole("textbox", { name: "Notebook name" });
  await field.fill("Discarded");
  await field.press("Escape");
  await expect(page.getByRole("link", { name: `${PREFIX} Moss survey` })).toBeVisible();
  await expect(rename).toBeFocused();

  await rename.click();
  await field.fill("   ");
  await field.press("Enter");
  await expect(page.getByText("Give the notebook a name.")).toBeVisible();

  await field.fill(`${PREFIX} Lichen survey`);
  await field.press("Enter");
  await expect(page.getByRole("link", { name: `${PREFIX} Lichen survey` })).toBeVisible();
  await expect(page.getByRole("link", { name: `${PREFIX} Moss survey` })).toHaveCount(0);

  // The new name is what the server keeps.
  await page.reload();
  await page.getByRole("searchbox", { name: "Search notebooks" }).fill("Lichen");
  await expect(page.getByRole("link", { name: `${PREFIX} Lichen survey` })).toBeVisible();
  const list = (await (await page.request.get("/api/notebooks")).json()) as { title: string; lastActivity: number; createdAt: number }[];
  expect(list.map((n) => n.title)).toContain(`${PREFIX} Lichen survey`);
  expect(list.every((n) => n.lastActivity >= n.createdAt)).toBe(true);
});

test("a notebook opens from its card after searching", async ({ page }) => {
  await seed(page, ["Open me"]);
  await page.goto("/");
  await page.getByRole("link", { name: `${PREFIX} Open me` }).first().click();
  await expect(page).toHaveURL(/\/notebook\/[A-Za-z0-9_-]+$/);
});
