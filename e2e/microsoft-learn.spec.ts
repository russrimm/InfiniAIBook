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

test("a broad Learn query lists many pages with filter, grouping, load more and bulk selection", async ({ page }) => {
  const learnPage = (n: number) => ({
    title: n <= 20 ? `Copilot Studio doc ${n}` : n <= 40 ? `Copilot training ${n}` : `Advanced Copilot training ${n}`,
    url: `https://learn.microsoft.com/microsoft-copilot-studio/page-${n}`,
    host: "learn.microsoft.com", provider: "microsoft-learn", snippet: `Snippet ${n}`,
    kind: n <= 20 ? "Documentation" : "Training", added: false,
  });
  const offsets: unknown[] = [];
  await page.route("**/api/discover", async (route) => {
    const body = route.request().postDataJSON() as { offset?: number };
    offsets.push(body.offset);
    const first = body.offset === undefined;
    await route.fulfill({ json: {
      queries: ["Copilot Studio", "Copilot Studio overview"], provider: "microsoft-learn", limit: 60,
      results: Array.from({ length: first ? 30 : 20 }, (_, i) => learnPage((first ? 0 : 30) + i + 1)),
      nextOffset: first ? 30 : null,
      warnings: first ? ["1 of 6 complementary searches failed."] : [],
    } });
  });
  const id = await openLearn(page);
  const imported: string[] = [];
  await page.route(`**/api/notebooks/${id}/sources`, async (route) => {
    imported.push((route.request().postDataJSON() as { learnUrl: string }).learnUrl);
    const response = await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title: `Imported ${imported.length}`, text: "The complete Microsoft Learn page.".repeat(15) },
    });
    await route.fulfill({ response });
  });
  const dialog = page.getByRole("dialog", { name: "Microsoft Learn" });
  await dialog.getByLabel("Topic").fill("Copilot Studio");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();

  await expect(dialog.getByRole("status")).toHaveText("30 pages found so far");
  await expect(dialog.getByRole("alert").filter({ hasText: "complementary searches failed" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Documentation (20)" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Training (10)" })).toBeVisible();

  await dialog.getByRole("button", { name: "Load more results" }).click();
  await expect(dialog.getByRole("status")).toHaveText("50 pages found");
  await expect(dialog.getByRole("button", { name: "Load more results" })).toBeHidden();
  expect(offsets).toEqual([undefined, 30]);

  await dialog.getByRole("button", { name: /^Training \(30\)$/ }).click();
  await expect(dialog.getByRole("status")).toHaveText("Showing 30 of 50 pages");
  await dialog.getByLabel("Filter results").fill("advanced");
  await expect(dialog.getByRole("status")).toHaveText("Showing 10 of 50 pages");
  // The five strongest pages are preselected; the filtered ten join them.
  await dialog.getByRole("button", { name: "Select 10 shown" }).click();
  await expect(dialog.getByText("15 selected")).toBeVisible();
  await dialog.getByRole("button", { name: "Add 15 sources" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => imported.length).toBe(15);
  expect(new Set(imported).size).toBe(15);
  for (let n = 41; n <= 50; n++) {
    expect(imported).toContain(`https://learn.microsoft.com/microsoft-copilot-studio/page-${n}`);
  }
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
