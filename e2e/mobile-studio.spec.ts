import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The compact mobile header and its More menu, the panel tabs, and Studio's
 * grouping, filter and "why is Generate off" message.
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

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function expectTouchTarget(target: Locator) {
  const box = (await target.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

test.describe("mobile header at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("is one compact row of named 44px controls without horizontal overflow", async ({ page }) => {
    const id = await createNotebook(page, "Mobile header notebook", true);
    await page.goto(`/notebook/${id}`);
    const header = page.getByRole("banner");
    await expect(header.getByRole("textbox", { name: "Notebook title" })).toBeVisible();

    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const box = (await header.boundingBox())!;
    expect(box.height).toBeLessThan(80);

    for (const name of ["Back to notebooks", "Add sources", "More actions"]) {
      const control = header.getByRole(name === "Back to notebooks" ? "link" : "button", { name });
      await expect(control).toBeVisible();
      await expect(control).toHaveAttribute("title", name);
      await expectTouchTarget(control);
    }

    // Secondary actions live in the menu, not as extra rows of buttons.
    for (const name of ["Export", "Screen helper", /^Models/, "Help and about"]) {
      await expect(header.getByRole("button", { name })).toBeHidden();
    }

    // Every visible control in the header has an accessible name.
    const unnamed = await header.locator("a:visible, button:visible").evaluateAll((els) =>
      els.filter((el) => !(el.getAttribute("aria-label") || el.textContent?.trim())).length,
    );
    expect(unnamed).toBe(0);
  });

  test("the More menu opens, moves and closes from the keyboard and returns focus", async ({ page }) => {
    const id = await createNotebook(page, "Menu notebook", true);
    await page.goto(`/notebook/${id}`);
    const more = page.getByRole("button", { name: "More actions" });
    await expect(more).toHaveAttribute("aria-expanded", "false");

    await more.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const items = menu.getByRole("menuitem");
    await expect(items.first()).toBeFocused();
    await expect(items).toHaveText([/Search/, /Screen helper/, /Models/, /Export notebook/, /Theme/, /Command palette/, /Help & about/]);
    for (let i = 0; i < (await items.count()); i++) await expectTouchTarget(items.nth(i));

    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(items.last()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.first()).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(items.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(items.first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();

    // ArrowUp on the trigger opens it on the last item.
    await page.keyboard.press("ArrowUp");
    await expect(items.last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(menu).toBeHidden();

    await more.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(200, 600);
    await expect(menu).toBeHidden();
  });

  test("Escape in the menu does not also close the Sources panel", async ({ page }) => {
    const id = await createNotebook(page, "Menu and sources", true);
    await page.goto(`/notebook/${id}`);
    await page.getByRole("button", { name: "Add sources", exact: true }).first().click();
    await expect(page.locator("#add-sources")).toBeVisible();
    const more = page.getByRole("button", { name: "More actions" });
    await more.focus();
    // Arrow keys open it without a click, which would itself dismiss the panel.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(page.locator("#sources-panel")).toBeVisible();
  });

  test("menu actions work and dialogs hand focus back to the menu button", async ({ page }) => {
    const id = await createNotebook(page, "Menu actions notebook", true);
    await page.goto(`/notebook/${id}`);
    const more = page.getByRole("button", { name: "More actions" });

    await more.click();
    await page.getByRole("menuitem", { name: /Help & about/ }).click();
    const dialog = page.getByRole("dialog", { name: "InfiniAIBook" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();

    await more.click();
    await page.getByRole("menuitem", { name: /Models/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();

    // The theme item cycles in place so the menu stays open.
    await more.click();
    const theme = page.getByRole("menuitem", { name: /Theme/ });
    const before = await theme.textContent();
    await theme.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(theme).not.toHaveText(before!);

    await page.getByRole("menuitem", { name: /Search/ }).click();
    await page.waitForURL(/\/search\?notebookId=/);
  });

  test("the panel tabs are 44px, show state and fit the screen on every panel", async ({ page }) => {
    const id = await createNotebook(page, "Panel tabs notebook", true);
    await page.goto(`/notebook/${id}`);
    const tabs = page.getByRole("navigation", { name: "Notebook panels" });
    for (const name of [/^sources/i, /^chat/i, /^studio/i, /^notes/i]) {
      await expectTouchTarget(tabs.getByRole("button", { name }));
    }
    await expect(tabs.getByRole("button", { name: /^sources/i })).toContainText("1 of 1 in use");

    await tabs.getByRole("button", { name: /^studio/i }).click();
    await expect(tabs.getByRole("button", { name: /^studio/i })).toHaveAttribute("aria-pressed", "true");
    const studio = page.getByRole("complementary", { name: "Studio" });
    await expect(studio).toBeVisible();
    // The panel fills the screen width rather than running off its right edge.
    const box = (await studio.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    const create = studio.getByRole("button", { name: "Library (0)" });
    const createBox = (await create.boundingBox())!;
    expect(createBox.x + createBox.width).toBeLessThanOrEqual(390);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await tabs.getByRole("button", { name: /^notes/i }).click();
    await expect(studio).toBeHidden();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("Open Studio in the steps switches to the Studio tab", async ({ page }) => {
    const id = await createNotebook(page, "Steps on mobile", true);
    await page.goto(`/notebook/${id}`);
    await page.getByRole("group", { name: /^Step \d of 3/ }).getByRole("button", { name: "Open Studio" }).click();
    await expect(page.getByRole("complementary", { name: "Studio" })).toBeVisible();
  });
});

test.describe("desktop header at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("keeps its labeled actions and has no More menu", async ({ page }) => {
    const id = await createNotebook(page, "Desktop header notebook", true);
    await page.goto(`/notebook/${id}`);
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Search" })).toContainText("Search");
    await expect(header.getByRole("button", { name: "Screen helper" })).toContainText("Screen helper");
    await expect(header.getByRole("button", { name: "Export" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Help and about" })).toContainText("Help");
    await expect(header.getByRole("button", { name: "More actions" })).toBeHidden();
    expect((await header.boundingBox())!.height).toBeLessThan(70);
  });

  test("the Open Studio step returns when Studio is not the visible panel", async ({ page }) => {
    const id = await createNotebook(page, "Steps on desktop", true);
    await page.goto(`/notebook/${id}`);
    const open = page.getByRole("group", { name: /^Step \d of 3/ }).getByRole("button", { name: "Open Studio" });
    await expect(open).toBeHidden();
    await page.getByRole("button", { name: /^notes/i }).last().click();
    await expect(open).toBeVisible();
    await open.click();
    await expect(page.getByRole("complementary", { name: "Studio" })).toBeVisible();
    await expect(open).toBeHidden();
  });
});

test.describe("Studio grouping", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("groups formats, collapses groups and filters by name or purpose", async ({ page }) => {
    const id = await createNotebook(page, "Studio groups", true);
    await page.goto(`/notebook/${id}`);
    const studio = page.getByRole("complementary", { name: "Studio" });

    for (const key of ["listen", "watch", "read", "visualize", "study"]) {
      await expect(studio.getByTestId(`studio-group-${key}`)).toBeVisible();
    }
    const report = studio.getByRole("button", { name: "Generate Report" });
    await expect(report).toBeEnabled();

    const read = studio.getByRole("button", { name: /^Read/ });
    await read.click();
    await expect(read).toHaveAttribute("aria-expanded", "false");
    await expect(report).toBeHidden();
    await read.click();
    await expect(report).toBeVisible();

    const filter = studio.getByRole("searchbox", { name: "Filter formats" });
    await filter.fill("quiz");
    await expect(studio.getByRole("status").filter({ hasText: "match" })).toContainText(/^\d+ formats? match/);
    await expect(studio.getByRole("button", { name: "Generate Quiz" })).toBeVisible();
    await expect(studio.getByRole("button", { name: /Live discussion/ })).toHaveCount(0);
    await expect(report).toBeHidden();

    // Words from the purpose or file type find a format too.
    await filter.fill("powerpoint");
    await expect(studio.getByRole("button", { name: "Generate PowerPoint deck" })).toBeVisible();
    await expect(studio.getByRole("button", { name: "Generate Quiz" })).toBeHidden();

    // A collapsed group opens for its matches, and keeps its state once the filter clears.
    await filter.fill("");
    await read.click();
    await expect(report).toBeHidden();
    await filter.fill("report");
    await expect(report).toBeVisible();
    await filter.fill("");
    await expect(report).toBeHidden();
    await read.click();
    await expect(report).toBeVisible();

    await filter.fill("watch");
    for (const name of ["Whiteboard video", "Motion explainer", "Training video"]) {
      await expect(studio.getByRole("button", { name: `Generate ${name}` })).toBeVisible();
    }

    await filter.fill("zzzz");
    await expect(studio.getByText("No format matches “zzzz”.")).toBeVisible();
    await studio.getByRole("button", { name: "Clear filter" }).click();
    await expect(filter).toHaveValue("");
    await expect(report).toBeVisible();

    await filter.fill("faq");
    await filter.press("Escape");
    await expect(filter).toHaveValue("");
  });

  test("says why Generate is off and how to fix it", async ({ page }) => {
    const id = await createNotebook(page, "Studio no sources");
    await page.goto(`/notebook/${id}`);
    const studio = page.getByRole("complementary", { name: "Studio" });
    const reason = studio.getByTestId("studio-blocked");
    await expect(reason).toContainText("Generate is off: no sources yet");

    const generate = studio.getByRole("button", { name: "Generate Report" });
    await expect(generate).toBeDisabled();
    await expect(generate).toHaveAccessibleDescription(/Generate is off: no sources yet/);
    await expect(studio.getByRole("button", { name: "Generate Audio overview" })).toHaveAccessibleDescription(
      /no sources yet/,
    );
    await expect(studio.getByRole("button", { name: /Live discussion/ })).toHaveAccessibleDescription(
      /no sources yet/,
    );

    await reason.getByRole("button", { name: "Add sources" }).click();
    await expect(page.locator("#add-sources")).toBeFocused();
  });

  test("asks for a ticked source when none is chosen, then enables Generate", async ({ page }) => {
    const id = await createNotebook(page, "Studio untick", true);
    await page.goto(`/notebook/${id}`);
    const studio = page.getByRole("complementary", { name: "Studio" });
    await expect(studio.getByTestId("studio-blocked")).toHaveCount(0);

    await page.getByRole("banner").getByRole("button", { name: "Sources (1)" }).click();
    await page.getByRole("checkbox", { name: /Field notes/ }).uncheck();
    const reason = studio.getByTestId("studio-blocked");
    await expect(reason).toContainText("no source is ticked");
    await expect(studio.getByRole("button", { name: "Generate Report" })).toBeDisabled();

    await reason.getByRole("button", { name: "Choose sources" }).click();
    await expect(page.locator("#select-all-sources")).toBeFocused();
    await page.getByRole("checkbox", { name: /Field notes/ }).check();
    await expect(reason).toHaveCount(0);
    await expect(studio.getByRole("button", { name: "Generate Report" })).toBeEnabled();
  });
});
