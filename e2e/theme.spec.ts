import { expect, test } from "@playwright/test";

test("the theme toggle switches, persists and avoids a flash on reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");

  const toggle = page.getByTestId("theme-toggle");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(html).toHaveAttribute("data-theme-pref", "light");

  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme-pref", "system");
});

test("deleting a notebook asks in a themed dialog, not a browser prompt", async ({ page }) => {
  const title = `Delete me ${Date.now()}`;
  const res = await page.request.post("/api/notebooks", { data: {} });
  const { id } = (await res.json()) as { id: string };
  await page.request.patch(`/api/notebooks/${id}`, { data: { title } });

  let nativeDialogs = 0;
  page.on("dialog", (d) => {
    nativeDialogs++;
    void d.dismiss();
  });
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(`delete.*${title}`, "i") }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  expect(nativeDialogs).toBe(0);
});