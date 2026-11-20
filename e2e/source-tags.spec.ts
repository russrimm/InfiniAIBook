import { expect, test, type Page } from "@playwright/test";

async function notebook(page: Page, titles: string[]) {
  const created = await page.request.post("/api/notebooks", { data: { title: "Tag sources" } });
  const { id } = (await created.json()) as { id: string };
  for (const title of titles) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title, text: `${title} describes how chlorophyll absorbs blue and red light. `.repeat(10) },
    });
  }
  return id;
}

const TITLES = ["Paper one", "Paper two", "Paper three", "Memo one", "Memo two", "Memo three"];

async function open(page: Page) {
  const id = await notebook(page, TITLES);
  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: `Sources (${TITLES.length})`, exact: true }).click();
  const list = page.getByRole("region", { name: "Source synopses" });
  await expect(list.getByRole("checkbox")).toHaveCount(TITLES.length);
  return { id, list };
}

test("tags a source, filters by the tag, and ticks only the matches to tag them in bulk with undo", async ({ page }) => {
  const { list } = await open(page);

  // One source by hand.
  await list.getByRole("button", { name: "Edit tags for Memo one" }).click();
  await list.getByRole("textbox", { name: /Tags for this source/ }).fill("Archive, memos");
  await list.getByRole("button", { name: "Save tags" }).click();
  const filterBar = list.getByRole("group", { name: "Filter sources by tag" });
  await expect(filterBar.getByRole("button", { name: /^memos/ })).toBeVisible();
  await expect(list.getByRole("list", { name: "Tags on Memo one" })).toContainText("Archive");

  // Select by filter, then tag the three matches.
  await page.getByRole("searchbox", { name: "Filter sources" }).fill("paper");
  await expect(list.getByRole("checkbox")).toHaveCount(3);
  await list.getByRole("button", { name: "Only these" }).click();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const bar = list.getByRole("group", { name: "Manage ticked sources" });
  await expect(bar).toContainText("3 sources ticked");
  await bar.getByRole("combobox", { name: "Tag name" }).fill("Papers");
  await bar.getByRole("button", { name: "Add tag" }).click();
  await expect(bar.getByRole("status")).toContainText("Tagged 3 sources “Papers”.");
  await expect(filterBar.getByRole("button", { name: /^Papers\s*3/ })).toBeVisible();

  // Undo puts the tags back the way they were.
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(filterBar.getByRole("button", { name: /^Papers/ })).toHaveCount(0);

  // Tag again and filter by the chip.
  await bar.getByRole("combobox", { name: "Tag name" }).fill("Papers");
  await bar.getByRole("button", { name: "Add tag" }).click();
  await expect(bar.getByRole("status")).toContainText("Tagged 3 sources");
  await page.getByRole("searchbox", { name: "Filter sources" }).fill("");
  await filterBar.getByRole("button", { name: /^Papers\s*3/ }).click();
  await expect(list.getByRole("checkbox")).toHaveCount(3);
  await expect(list.getByText("3 showing tagged “Papers”.")).toBeVisible();
  const saved = (await (await page.request.get(page.url().replace("/notebook/", "/api/notebooks/"))).json()) as {
    sources: { title: string; tags: string[] }[];
  };
  expect(saved.sources.filter((s) => s.tags.includes("Papers")).map((s) => s.title).sort()).toEqual(["Paper one", "Paper three", "Paper two"]);
});

test("deletes the ticked sources after a confirmation, with one Undo for all of them", async ({ page }) => {
  const { list } = await open(page);
  await page.getByRole("searchbox", { name: "Filter sources" }).fill("memo");
  await list.getByRole("button", { name: "Only these" }).click();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const bar = list.getByRole("group", { name: "Manage ticked sources" });
  await bar.getByRole("button", { name: "Delete…" }).click();

  const confirm = page.getByRole("alertdialog", { name: "Delete 3 sources?" });
  await expect(confirm).toContainText("You can undo this");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(list.getByRole("checkbox", { name: /Memo/ })).toHaveCount(3);

  await bar.getByRole("button", { name: "Delete…" }).click();
  await confirm.getByRole("button", { name: "Delete 3 sources" }).click();
  await expect(list.getByRole("checkbox", { name: /Memo/ })).toHaveCount(0);
  const toast = page.getByRole("status").filter({ hasText: "3 sources deleted" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(list.getByRole("checkbox", { name: /Memo/ })).toHaveCount(3);

  // Without Undo the sources are gone once the window passes.
  await bar.getByRole("button", { name: "Delete…" }).click();
  await confirm.getByRole("button", { name: "Delete 3 sources" }).click();
  // Three sources are left, too few for the filter box, so the old filter no longer hides them.
  await expect(list.getByRole("checkbox")).toHaveCount(3);
  await expect(list.getByRole("checkbox", { name: /Paper one/ })).toBeVisible();
  await expect.poll(async () => {
    const r = (await (await page.request.get(page.url().replace("/notebook/", "/api/notebooks/"))).json()) as { sources: unknown[] };
    return r.sources.length;
  }, { timeout: 20_000 }).toBe(3);
});
