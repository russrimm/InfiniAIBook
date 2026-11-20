import { expect, test, type Page } from "@playwright/test";

async function notebook(page: Page, titles = ["Garden pilot", "Soil chemistry"]) {
  const created = await page.request.post("/api/notebooks", { data: { title: "Palette" } });
  const { id } = (await created.json()) as { id: string };
  for (const title of titles) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title, text: `${title} says the Riverside garden pilot builds 24 raised beds in April 2025. `.repeat(6) },
    });
  }
  await page.goto(`/notebook/${id}`);
  await expect(page.getByLabel("Question")).toBeEnabled();
  return id;
}

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });
const search = (page: Page) => palette(page).getByRole("combobox", { name: "Search commands" });

test("Ctrl+K opens the palette, even while typing, and Escape returns focus", async ({ page }) => {
  await notebook(page);
  const question = page.getByRole("textbox", { name: "Question" });
  await question.focus();
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
  await expect(palette(page).getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
  await expect(question).toBeFocused();

  // Ctrl+K again toggles it, and it will not open on top of another dialog.
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeHidden();
  await page.getByRole("banner").getByRole("button", { name: "Help and about" }).click();
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toHaveCount(0);
});

test("lists actions, formats, sources and shortcuts, filters as you type, and works from the keyboard", async ({ page }) => {
  await notebook(page);
  await page.keyboard.press("Control+k");
  const list = palette(page).getByRole("listbox", { name: "Commands" });
  await expect(list.getByRole("option", { name: /Actions: Ask a question/ })).toBeVisible();
  await expect(list.getByRole("option", { name: /Sources: Garden pilot/ })).toBeVisible();
  await expect(list.getByRole("option", { name: /Shortcuts: \?: Show this list/ })).toBeVisible();

  // Studio formats are findable by name; Enter goes to that format's Generate button.
  await search(page).fill("quiz");
  await expect(palette(page).getByRole("status")).toContainText(/\d+ results?/);
  await expect(list.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await expect(list.getByRole("option").first()).toHaveAccessibleName(/^Quiz .*Studio$/);
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Generate Quiz", exact: true })).toBeFocused();

  // Arrow keys move the choice; Enter opens the chosen source in the reader.
  await page.keyboard.press("Control+k");
  await search(page).fill("soil");
  await expect(list.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(list.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Soil chemistry/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Shortcuts open the list; "/" is the same as asking a question.
  await page.keyboard.press("Control+k");
  await search(page).fill("show this list");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await search(page).fill("zzzzqq");
  await expect(palette(page).getByText(/Nothing matches/)).toBeVisible();
  await expect(palette(page).getByRole("status")).toHaveText("No matching commands");
});

test("Find in this chat counts matches, steps through them and marks them", async ({ page }) => {
  await notebook(page);
  const ask = async (q: string) => {
    await page.getByRole("textbox", { name: "Question" }).fill(q);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(new RegExp(`Answer \\d+ to "${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`))).toBeVisible();
  };
  await ask("How many beds are planned?");
  await ask("What do the beds cost?");

  // Not offered while the chat is empty; the palette finds it once there is a conversation.
  await page.keyboard.press("Control+k");
  await search(page).fill("find in this chat");
  await page.keyboard.press("Enter");
  const find = page.getByRole("search", { name: "Find in this chat" });
  await expect(find).toBeVisible();
  const input = find.getByRole("searchbox", { name: "Find in this chat" });
  await expect(input).toBeFocused();

  await input.fill("beds");
  const status = find.getByRole("status");
  await expect(status).toHaveText(/^1 of \d+$/);
  const total = Number((await status.innerText()).split(" of ")[1]);
  expect(total).toBeGreaterThanOrEqual(4);
  const marked = await page.evaluate(() => (CSS as unknown as { highlights?: Map<string, { size: number }> }).highlights?.get("chat-find")?.size ?? -1);
  expect(marked === -1 || marked === total).toBe(true);

  await input.press("Enter");
  await expect(status).toHaveText(`2 of ${total}`);
  await input.press("Shift+Enter");
  await input.press("Shift+Enter");
  await expect(status).toHaveText(`${total} of ${total}`);
  await find.getByRole("button", { name: "Next match" }).click();
  await expect(status).toHaveText(`1 of ${total}`);

  await input.fill("no such words here");
  await expect(status).toHaveText("No matches");
  await expect(find.getByRole("button", { name: "Next match" })).toBeDisabled();

  await input.press("Escape");
  await expect(find).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Question" })).toBeFocused();
  const left = await page.evaluate(() => (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.has("chat-find") ?? false);
  expect(left).toBe(false);
});
