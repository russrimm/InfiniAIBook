import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function openNotebook(page: Page, request: APIRequestContext) {
  const nb = await request.post("/api/notebooks", { data: { title: "Cost and cancel" } });
  const { id } = (await nb.json()) as { id: string };
  const source = await request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Field notes", text: "Chlorophyll absorbs blue and red light. ".repeat(20) },
  });
  expect(source.ok()).toBeTruthy();
  await page.goto(`/notebook/${id}`);
}

const estimate = (cents: number, over: Record<string, unknown> = {}) => ({
  type: "video",
  cents,
  display: `$${(cents / 100).toFixed(2)}`,
  lines: [
    { label: "Writing the script", cents: 8, display: "$0.08" },
    { label: "Drawing 6 scenes", cents: cents - 8, display: `$${((cents - 8) / 100).toFixed(2)}` },
  ],
  fits: true,
  message: null,
  confirmAboveCents: 100,
  ...over,
});

test("shows the estimated cost before generating, and Cancel stops the job on the server", async ({ page, request }) => {
  await openNotebook(page, request);
  await page.route("**/api/generate", async () => {
    // Never answered: the generation is still running when Cancel is pressed.
    await new Promise((r) => setTimeout(r, 30_000));
  });
  const cancelRequest = page.waitForRequest((r) => /\/api\/jobs\/[0-9a-f]{24}\/cancel$/.test(r.url()) && r.method() === "POST");

  await page.getByRole("button", { name: "Generate Report", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Generation status" });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/Estimated cost: about \$\d+\.\d\d\. This is an estimate, not a quote\./)).toBeVisible();

  await modal.getByRole("button", { name: "Cancel generation" }).click();
  await cancelRequest;
  await expect(modal.getByRole("status")).toContainText("Cancelled. Nothing was saved");
  await expect(modal.getByRole("button", { name: "Cancel generation" })).toHaveCount(0);
  await modal.getByRole("button", { name: "Close generation status" }).click();
  await expect(page.getByRole("button", { name: "Generate Report", exact: true })).toBeEnabled();
});

test("asks before a costly generation and starts nothing when declined", async ({ page, request }) => {
  await openNotebook(page, request);
  let generated = false;
  await page.route("**/api/estimate", (route) => route.fulfill({ json: estimate(500) }));
  await page.route("**/api/video", (route) => {
    generated = true;
    return route.abort();
  });

  await page.getByRole("button", { name: "Generate Whiteboard video", exact: true }).click();
  const ask = page.getByRole("alertdialog", { name: "Generate Whiteboard video?" });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("about $5.00");
  await expect(ask).toContainText("Writing the script: $0.08");
  await ask.getByRole("button", { name: "Not now" }).click();
  await expect(ask).toBeHidden();
  await page.waitForTimeout(300);
  expect(generated).toBe(false);
  await expect(page.getByRole("button", { name: "Generate Whiteboard video", exact: true })).toBeEnabled();
});

test("refuses a generation the daily budget cannot pay for, and says why", async ({ page, request }) => {
  await openNotebook(page, request);
  let generated = false;
  await page.route("**/api/estimate", (route) =>
    route.fulfill({
      json: estimate(900, {
        fits: false,
        message: "This would cost about $9.00, but only $1.00 is left of today's $25.00 budget. Raise DAILY_BUDGET_USD, or set it to 0 to turn the ceiling off.",
      }),
    }),
  );
  await page.route("**/api/video", (route) => {
    generated = true;
    return route.abort();
  });
  await page.getByRole("button", { name: "Generate Whiteboard video", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Generation status" }).getByRole("alert")).toContainText("only $1.00 is left");
  expect(generated).toBe(false);
});
