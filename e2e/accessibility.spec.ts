import { expect, test, type Page } from "@playwright/test";

/**
 * Keyboard and screen-reader basics on every page: notebooks open from the
 * keyboard, each page names itself, and every modal behaves like a dialog —
 * focus goes in, stays in, Escape closes only the top one, and focus returns
 * to whatever opened it.
 */

async function createNotebook(page: Page, title: string, withSource = false) {
  const res = await page.request.post("/api/notebooks", { data: {} });
  const { id } = (await res.json()) as { id: string };
  await page.request.patch(`/api/notebooks/${id}`, { data: { title } });
  if (withSource) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title: "Field notes", text: "Chlorophyll absorbs blue and red light. ".repeat(20) },
    });
  }
  return id;
}

const focusInDialog = (page: Page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));

test("a notebook card opens from the keyboard and the tab is titled", async ({ page }) => {
  const title = `Keyboard notebook ${Date.now()}`;
  const id = await createNotebook(page, title);
  await page.goto("/");
  const link = page.getByRole("link", { name: title });
  await link.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/notebook/${id}`);
  await expect(page).toHaveTitle(`${title} — InfiniAIBook`);
  await expect(page.getByRole("main")).toBeVisible();
});

test("notebook delete icons stay visible without hover and keep confirmation and undo", async ({ page }) => {
  const title = `Delete icon notebook ${Date.now()}`;
  await createNotebook(page, title);
  await page.goto("/");
  await page.mouse.move(0, 0);

  const link = page.getByRole("link", { name: title, exact: true });
  const deleteButton = page.getByRole("button", { name: `Delete notebook ${title}`, exact: true });
  await expect(deleteButton).toBeVisible();
  await expect(deleteButton).toHaveCSS("opacity", "1");
  await expect(deleteButton.locator("svg")).toBeVisible();

  await deleteButton.focus();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("alertdialog", { name: "Delete this notebook?" });
  await expect(confirmation).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  await expect(link).toBeVisible();

  await deleteButton.click();
  await confirmation.getByRole("button", { name: "Delete notebook", exact: true }).click();
  await expect(link).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(link).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(0, 0);
  await deleteButton.blur();
  await expect(deleteButton).toBeVisible();
  await expect(deleteButton).toHaveCSS("opacity", "1");
});

test("dialogs trap focus, close on Escape and restore focus", async ({ page }) => {
  const id = await createNotebook(page, "Dialog notebook", true);
  await page.goto(`/notebook/${id}`);

  const about = page.getByRole("button", { name: "Help and about" });
  await about.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "InfiniAIBook" });
  await expect(dialog).toBeVisible();
  expect(await focusInDialog(page)).toBe(true);

  for (let i = 0; i < 10; i++) await page.keyboard.press("Tab");
  expect(await focusInDialog(page)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(about).toBeFocused();
});

test("a drag that ends on the backdrop does not close a dialog", async ({ page }) => {
  const id = await createNotebook(page, "Backdrop notebook");
  await page.goto(`/notebook/${id}`);
  await page.getByRole("button", { name: "Help and about" }).click();
  const box = (await page.getByRole("dialog").boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(4, 4);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.mouse.click(4, 4);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("closing a note with unsaved text asks first", async ({ page }) => {
  const id = await createNotebook(page, "Notes notebook");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/notebook/${id}`);
  await page.getByRole("button", { name: /^notes/i }).last().click();
  await page.getByRole("button", { name: "＋ Note" }).click();
  await page.getByLabel("Note content (Markdown)").fill("Half a thought");

  await page.keyboard.press("Escape");
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(/unsaved|discard/i);
  await confirm.getByRole("button", { name: "Keep editing" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("dialog", { name: "New note" })).toBeVisible();
});

test("login and search pages label their fields", async ({ page }) => {
  await page.goto("/search");
  await expect(page).toHaveTitle("Search — InfiniAIBook");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.getByRole("radiogroup", { name: "Search mode" })).toBeVisible();

  // With no password configured, the sign-in page forwards instead of locking.
  await page.goto("/login?next=/search");
  await page.waitForURL((u) => u.pathname === "/search");
});
test("Escape dismisses the inline add-source forms and returns focus", async ({ page }) => {
  const id = await createNotebook(page, "Inline forms notebook");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/notebook/${id}`);
  await page.locator("header").getByRole("button", { name: "Add sources", exact: true }).click();
  for (const name of ["Add link", "Paste text"]) {
    const opener = page.getByRole("button", { name });
    await opener.click();
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(opener).toHaveAttribute("aria-expanded", "false");
    await expect(opener).toBeFocused();
  }
});
