import { expect, test, type Page } from "@playwright/test";

async function notebook(page: Page, title: string) {
  const created = await page.request.post("/api/notebooks", { data: { title } });
  return ((await created.json()) as { id: string }).id;
}

/** Open the notebook and wait until the workspace has loaded and hydrated. */
async function openNotebook(page: Page, title: string) {
  const id = await notebook(page, title);
  await page.goto(`/notebook/${id}`);
  await expect(page.getByRole("banner").getByRole("button", { name: /^Sources/ })).toBeVisible();
  return id;
}

/** Dispatch a file drag the way the browser does when a file is dragged in from the desktop. */
async function dragFile(page: Page, selector: string, type: "dragenter" | "dragover" | "drop", name: string) {
  return page.evaluate(
    ({ selector, type, name }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([`${name} explains how chlorophyll absorbs blue and red light. `.repeat(8)], name, { type: "text/plain" }));
      const event = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true });
      document.querySelector(selector)!.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { selector, type, name },
  );
}

test("a file dropped anywhere on the notebook is added as a source", async ({ page }) => {
  const id = await openNotebook(page, "Drop anywhere");
  // Dragging a file over the chat shows where it will go.
  await dragFile(page, "main", "dragenter", "leaf-notes.txt");
  await expect(page.getByTestId("page-drop")).toBeVisible();
  await expect(page.getByText("Drop files to add them as sources")).toBeVisible();

  // The page accepts the drop (so the browser does not open the file in this tab) and uploads it.
  expect(await dragFile(page, "main", "dragover", "leaf-notes.txt")).toBe(true);
  expect(await dragFile(page, "main", "drop", "leaf-notes.txt")).toBe(true);
  await expect(page.getByTestId("page-drop")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /leaf-notes/ })).toBeVisible();

  const saved = (await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { title: string }[] };
  expect(saved.sources.map((s) => s.title)).toEqual(["leaf-notes.txt"]);
});

test("a file dropped on the upload zone is added once, not twice", async ({ page }) => {
  const id = await openNotebook(page, "Drop on zone");
  await page.getByRole("banner").getByRole("button", { name: "Add sources" }).click();
  await dragFile(page, "#add-sources", "drop", "zone-notes.txt");
  await expect(page.getByRole("checkbox", { name: /zone-notes/ })).toBeVisible();
  await page.waitForTimeout(1500);
  const saved = (await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { title: string }[] };
  expect(saved.sources).toHaveLength(1);
});

test("a drop while a dialog is open does not leave the page or add anything behind it", async ({ page }) => {
  const id = await openNotebook(page, "Drop behind dialog");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await dragFile(page, "body", "drop", "behind.txt")).toBe(true);
  await page.waitForTimeout(1000);
  const saved = (await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: unknown[] };
  expect(saved.sources).toHaveLength(0);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("dragging something that is not a file shows no drop cue", async ({ page }) => {
  await openNotebook(page, "Drag text");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "just some text");
    document.querySelector("main")!.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId("page-drop")).toHaveCount(0);
});
