import { expect, test } from "@playwright/test";

test("backs up the library, then restores it only after confirmation", async ({ page }) => {
  const title = `Backup notebook ${Date.now()}`;
  const created = await page.request.post("/api/notebooks", { data: { title } });
  expect(created.ok()).toBeTruthy();

  const download = await page.request.get("/api/backup");
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/zip");
  const zip = await download.body();
  expect(zip.subarray(0, 2).toString()).toBe("PK");

  await page.goto("/");
  const opener = page.getByRole("button", { name: "Backup", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Backup and restore" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Download backup (.zip)" })).toHaveAttribute("href", "/api/backup");

  // A file that is not a backup is explained, and nothing changes.
  await dialog.getByLabel("Choose a backup ZIP to restore").setInputFiles({
    name: "notes.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("this is not a backup archive, only some words"),
  });
  await expect(dialog.getByRole("alert")).toContainText(/ZIP/);

  await dialog.getByLabel("Choose a backup ZIP to restore").setInputFiles({
    name: "my-backup.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expect(dialog.getByTestId("backup-staged")).toContainText("my-backup.zip is a valid backup");

  const replace = dialog.getByRole("button", { name: "Replace my data with this backup" });
  await expect(replace).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /replaces all notebooks/ }).check();
  await replace.click();

  await expect(dialog.getByRole("status")).toContainText("Restored");
  await dialog.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("Escape closes the backup window and returns focus to its button", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Backup", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Backup and restore" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
