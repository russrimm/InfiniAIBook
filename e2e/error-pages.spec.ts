import { expect, test } from "@playwright/test";

test("an unknown address shows the themed not-found page with a way home", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found — InfiniAIBook");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to notebooks" }).click();
  await page.waitForURL("**/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the health endpoint answers with a bare status", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
