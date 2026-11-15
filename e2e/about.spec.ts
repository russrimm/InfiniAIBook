import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim();

for (const location of ["home", "notebook"] as const) {
  test(`Help topics, author and complete license are accessible from ${location}`, async ({ page }) => {
    let url = "/";
    if (location === "notebook") {
      const response = await page.request.post("/api/notebooks", { data: {} });
      expect(response.ok()).toBe(true);
      const { id } = (await response.json()) as { id: string };
      url = `/notebook/${id}`;
    }
    await page.goto(url);
    const opener = page.getByRole("button", { name: "Help and about" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "InfiniAIBook", exact: true });
    await expect(dialog).toBeFocused();

    // The final summary must participate in useDialog's focus trap.
    const license = dialog.locator("summary").filter({ hasText: "MIT License:" });
    await page.keyboard.press("Shift+Tab");
    await expect(license).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();

    const liveTopic = dialog.locator("summary").filter({ hasText: "Use live Microsoft Learn in chat" });
    await liveTopic.focus();
    await page.keyboard.press("Enter");
    await expect(liveTopic.locator("..")).toHaveAttribute("open", "");
    await expect(liveTopic.locator("..")).toContainText("Live results do not create notebook sources.");
    await expect(liveTopic.locator("..").getByRole("link", { name: /^Learn more:/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(liveTopic.locator("..")).not.toHaveAttribute("open");

    await dialog.getByRole("link", { name: "About and licenses", exact: true }).click();
    const author = dialog.getByRole("link", { name: "Russ RImmerman", exact: true });
    await expect(author).toHaveAttribute("href", "mailto:russ@russ.net");
    await expect(author.locator("..")).toHaveText("Russ RImmerman, Principal Microsoft Cloud Solution Architect");
    expect(normalize(await dialog.getByTestId("mit-license").innerText()))
      .toBe(normalize(readFileSync("LICENSE", "utf8")));

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
}

test("Help remains readable and navigable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Help and about" }).click();
  const dialog = page.getByRole("dialog", { name: "InfiniAIBook", exact: true });
  await dialog.getByRole("link", { name: "Studio formats and exports", exact: true }).click();
  const training = dialog.locator("summary").filter({ hasText: "Training visuals, design, animation and preview" });
  await training.click();
  await expect(training.locator("..")).toContainText("Plan all visuals again");
  await dialog.getByRole("link", { name: "About and licenses", exact: true }).click();
  await expect(dialog.getByTestId("mit-license")).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await dialog.getByTestId("mit-license").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
});
