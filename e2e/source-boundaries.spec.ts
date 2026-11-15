import { expect, test } from "@playwright/test";

test("Studio sends only checked sources and saves the same selection in Library", async ({ page, request }) => {
  const notebook = await request.post("/api/notebooks", { data: { title: "Selected-source boundary" } });
  const { id } = await notebook.json() as { id: string };
  const selected = await request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Selected garden", text: "The Riverside garden pilot builds 24 raised beds in April 2025. A drip kit costs $640." },
  });
  const { added } = await selected.json() as { added: { id: string }[] };
  expect(added).toHaveLength(1);
  const sourceId = added[0].id;
  const unchecked = await request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Unchecked ocean", text: "Ocean tides do not belong in the garden report." },
  });
  expect(selected.ok() && unchecked.ok()).toBeTruthy();
  await page.goto(`/notebook/${id}`);
  await page.getByRole("button", { name: /^Sources \(/ }).click();
  await page.getByRole("checkbox", { name: /Unchecked ocean/ }).uncheck();
  await page.getByRole("button", { name: "Collapse sources panel" }).click();
  const responsePromise = page.waitForResponse("**/api/generate");
  await page.getByRole("button", { name: "Generate Infographic", exact: true }).click();
  const response = await responsePromise;
  expect(response.request().postDataJSON().sourceIds).toEqual([sourceId]);
  const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  const result = events.find((event) => event.event === "result");
  expect(result.status).toBe(200);
  expect(result.body.content.sourceIds).toEqual([sourceId]);
  expect(result.body.content.citations.length).toBeGreaterThan(0);
  expect(result.body.content.citations.every((c: { sourceId: string }) => c.sourceId === sourceId)).toBe(true);
  const saved = await request.get(`/api/artifacts/${result.body.id}`);
  expect((await saved.json()).content.sourceIds).toEqual([sourceId]);
});
