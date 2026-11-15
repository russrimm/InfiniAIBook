import { expect, test, type Page } from "@playwright/test";

const learnUrl = "https://learn.microsoft.com/en-us/azure/overview";

async function openLearn(page: Page) {
  const response = await page.request.post("/api/notebooks", { data: {} });
  const { id } = await response.json() as { id: string };
  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: "Add sources", exact: true }).click();
  await page.getByRole("button", { name: "Microsoft Learn", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Microsoft Learn" })).toBeVisible();
  return id;
}

test("Learn search imports selected pages through the source queue", async ({ page }) => {
  await page.route("**/api/discover", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ provider: "microsoft-learn", topic: "Azure" });
    await route.fulfill({ json: {
      queries: ["Azure"], provider: "microsoft-learn",
      results: [{ title: "Learn overview", url: learnUrl, host: "learn.microsoft.com", provider: "microsoft-learn", snippet: "Official documentation", added: false }],
    } });
  });
  const id = await openLearn(page);
  await page.route(`**/api/notebooks/${id}/sources`, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ learnUrl });
    const response = await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title: "Learn overview", text: "The complete Microsoft Learn page.".repeat(15) },
    });
    await route.fulfill({ response });
  });
  const dialog = page.getByRole("dialog", { name: "Microsoft Learn" });
  await dialog.getByLabel("Topic").fill("Azure");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByText("Learn overview", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Add 1 source", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /^Learn overview/ })).toBeVisible();
});

test("live-only chat is opt-in, persists and opens snapshot citations on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await openLearn(page);
  const dialog = page.getByRole("dialog", { name: "Microsoft Learn" });
  const toggle = dialog.getByRole("checkbox", { name: "Use live Microsoft Learn in chat" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByLabel("Question")).toBeEnabled();
  const detail = await page.request.get(`/api/notebooks/${id}`);
  expect((await detail.json()).notebook.liveLearn).toBe(true);

  const citation = {
    n: 1, sourceId: `learn:${learnUrl}`, sourceTitle: "Microsoft Learn: Azure overview",
    part: 1, snippet: "A saved excerpt.", content: "The exact excerpt used when this answer was generated.", url: learnUrl,
  };
  await page.route("**/api/chat", (route) => route.fulfill({
    contentType: "application/x-ndjson",
    body: [
      { type: "citations", citations: [citation] },
      { type: "delta", v: "Azure is documented here [1]." },
      { type: "done", id: "learn-answer", citations: [citation] },
    ].map((event) => JSON.stringify(event)).join("\n") + "\n",
  }));
  await page.getByLabel("Question").fill("What is Azure?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: /^Citation 1: Microsoft Learn/ }).click();
  const snapshot = page.getByRole("dialog", { name: "Microsoft Learn citation" });
  await expect(snapshot).toContainText(citation.content);
  await expect(snapshot.getByRole("link", { name: "Open original on Microsoft Learn" })).toHaveAttribute("href", learnUrl);
  await page.keyboard.press("Escape");
  await expect(snapshot).toBeHidden();
  expect((await (await page.request.get(`/api/notebooks/${id}`)).json()).sources).toHaveLength(0);

  await page.getByRole("banner").getByRole("button", { name: "Add sources", exact: true }).click();
  await page.getByRole("button", { name: "Microsoft Learn", exact: true }).click();
  const savedToggle = page.getByRole("checkbox", { name: "Use live Microsoft Learn in chat" });
  await savedToggle.uncheck();
  await expect(savedToggle).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByLabel("Question")).toBeDisabled();
});
