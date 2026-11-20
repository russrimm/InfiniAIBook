import { expect, test } from "@playwright/test";

const TAGLINE = "Sources in. Cited answers, audio and video out.";

for (const [name, width, height, minLogo] of [
  ["desktop", 1440, 900, 128],
  ["mobile", 390, 844, 56],
] as const) {
  test(`the home hero shows a sized logo and the tagline at ${name} width`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.request.post("/api/notebooks", { data: { title: "Hero check" } });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: TAGLINE })).toBeVisible();

    const logo = page.getByTestId("hero-logo");
    await expect(logo).toBeVisible();
    const box = (await logo.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(minLogo);
    expect(box.height).toBeGreaterThanOrEqual(minLogo);
    // The bitmap is sharper than its box, so it never renders blurry on dense screens.
    const natural = await logo.evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(natural).toBeGreaterThanOrEqual(box.width * 2);

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);

    const create = page.getByRole("button", { name: "+ New notebook" });
    await expect(create).toBeVisible();
    expect((await create.boundingBox())!.y + (await create.boundingBox())!.height).toBeLessThanOrEqual(height);

    // The notebook list starts on screen, not below a tall header.
    const listHeading = page.getByRole("heading", { name: /^Your notebooks/ });
    await expect(listHeading).toBeVisible();
    expect((await listHeading.boundingBox())!.y).toBeLessThan(height - 100);
    if (width >= 1024) {
      const firstCard = page.getByRole("list").getByRole("link").first();
      const card = (await firstCard.boundingBox())!;
      expect(card.y).toBeLessThan(height);
    }
  });
}
