import { expect, test } from "@playwright/test";

async function notebook(page: import("@playwright/test").Page) {
  const created = await page.request.post("/api/notebooks", { data: { title: "Shortcuts" } });
  const { id } = (await created.json()) as { id: string };
  await page.request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Field notes", text: "Chlorophyll absorbs blue and red light. ".repeat(20) },
  });
  return id;
}

test("? lists the keyboard shortcuts and / jumps to the question box", async ({ page }) => {
  const id = await notebook(page);
  await page.goto(`/notebook/${id}`);
  await expect(page.getByRole("banner")).toBeVisible();
  const question = page.getByRole("textbox", { name: "Question" });

  await page.keyboard.press("/");
  await expect(question).toBeFocused();

  // Typing the same characters into a field is just text.
  await page.keyboard.type("what is ?/ about");
  await expect(question).toHaveValue("what is ?/ about");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await question.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("row", { name: /Jump to the question box/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Help offers the shortcuts list", async ({ page }) => {
  const id = await notebook(page);
  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: "Help and about" }).click();
  await page.getByRole("dialog", { name: "InfiniAIBook" }).getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "InfiniAIBook" })).toHaveCount(0);
});

test("shortcuts do nothing while a dialog is open", async ({ page }) => {
  const id = await notebook(page);
  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: "Help and about" }).click();
  const about = page.getByRole("dialog", { name: "InfiniAIBook" });
  await expect(about).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
  await expect(about).toBeVisible();
});

test("/ switches to the Chat tab on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await notebook(page);
  await page.goto(`/notebook/${id}`);
  const nav = page.getByRole("navigation", { name: "Notebook panels" });
  await nav.getByRole("button", { name: /^studio/i }).click();
  await expect(page.getByRole("textbox", { name: "Question" })).toBeHidden();
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: "Question" })).toBeFocused();
});
