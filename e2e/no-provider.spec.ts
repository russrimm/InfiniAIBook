import { expect, test } from "@playwright/test";

test("with no model provider, the app explains how to set one up instead of showing a model", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "No provider yet" } });
  const { id } = (await created.json()) as { id: string };

  await page.route("**/api/models", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    return route.fulfill({ response, json: { ...body, configured: false } });
  });

  await page.goto(`/notebook/${id}`);
  const notice = page.getByRole("status").filter({ hasText: "No model provider is set up" });
  await expect(notice).toBeVisible();
  // The header no longer advertises a model that nothing can serve.
  await expect(page.getByRole("banner").getByRole("button", { name: "Models", exact: true })).toBeVisible();

  await notice.getByRole("button", { name: "Show me how to set one up" }).click();
  const dialog = page.getByRole("dialog", { name: "Models" });
  await expect(dialog.getByText(/\.env\.local/).first()).toBeVisible();
  await expect(dialog.getByText("AZURE_OPENAI_ENDPOINT")).toBeVisible();
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
});

test("with a provider configured, the header shows the chat model and no setup notice", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "Provider ready" } });
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/notebook/${id}`);
  await expect(page.getByRole("banner").getByRole("button", { name: /^Models \(chat: / })).toBeVisible();
  await expect(page.getByText("No model provider is set up")).toHaveCount(0);
});
