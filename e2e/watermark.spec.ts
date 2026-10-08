import { expect, test } from "@playwright/test";

/**
 * The watermark picker on a video card and in its editor: a text mark chosen
 * before generating is saved with the script, and an uploaded image (converted
 * to PNG in the browser) can replace it.
 */

/** A 2 × 2 opaque red PNG. */
const LOGO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYEJRIAwAB8XAgICR7MUAAAAAElFTkSuQmCC",
  "base64"
);

type Training = { id: string; content: { watermarkChoice?: Record<string, unknown> | null } };

test("a text watermark is saved with the script and can be swapped for an uploaded image", async ({
  page,
  request,
}) => {
  const nb = await request.post("/api/notebooks", { data: { title: "Watermark pilot" } });
  const { id: notebookId } = (await nb.json()) as { id: string };
  await request.post(`/api/notebooks/${notebookId}/sources`, {
    data: {
      title: "Garden notes",
      text: "The Riverside garden pilot builds 24 raised beds in April 2025. A drip kit costs $640.",
    },
  });
  await page.goto(`/notebook/${notebookId}`);

  const card = page.getByTestId("training-card");
  await card.getByRole("button", { name: /^Options/ }).click();
  await card.getByLabel("Watermark", { exact: true }).selectOption("text");
  await card.getByLabel("Watermark text").fill("© Riverside Garden");
  await card.getByRole("radio", { name: "Top left" }).check({ force: true });
  await card.getByLabel("Watermark opacity").selectOption("solid");
  await card.getByRole("button", { name: "Generate Training video" }).click();

  const dialog = page.getByRole("dialog").last();
  await expect(dialog.getByRole("tab", { name: "Visuals" })).toBeVisible({ timeout: 30_000 });

  const list = await request.get(`/api/notebooks/${notebookId}`);
  const { artifacts } = (await list.json()) as { artifacts: { id: string; type: string }[] };
  const id = artifacts.find((a) => a.type === "training")!.id;
  const read = async () => ((await (await request.get(`/api/artifacts/${id}`)).json()) as Training).content;
  expect((await read()).watermarkChoice).toEqual({
    kind: "text",
    text: "© Riverside Garden",
    position: "top-left",
    size: "medium",
    opacity: "solid",
  });

  // The editor shows the same choice and can switch to an uploaded image.
  await expect(dialog.getByLabel("Watermark text")).toHaveValue("© Riverside Garden");
  await expect(dialog.getByRole("radio", { name: "Top left" })).toBeChecked();
  await dialog.getByLabel("Watermark", { exact: true }).selectOption("image");
  await expect(dialog.getByText(/^No images yet\. Press/)).toBeVisible();
  await dialog
    .locator('input[type="file"][accept^="image/png"]')
    .setInputFiles({ name: "Riverside logo.png", mimeType: "image/png", buffer: LOGO });
  await expect(dialog.getByLabel("Watermark image", { exact: true })).toHaveValue(/^w-/);
  await expect(dialog.getByRole("button", { name: "Delete Riverside logo" })).toBeVisible();
  await dialog.getByRole("radio", { name: "Bottom right" }).check({ force: true });

  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("button", { name: "Saved" })).toBeVisible();
  const saved = (await read()).watermarkChoice as { kind: string; image: string; position: string };
  expect(saved).toMatchObject({ kind: "image", position: "bottom-right", opacity: "solid" });

  const image = await request.get(`/api/watermark/${saved.image}`);
  expect(image.headers()["content-type"]).toBe("image/png");
  const del = await request.delete(`/api/watermark/${saved.image}`);
  expect(((await del.json()) as { images: unknown[] }).images).toEqual([]);
});
