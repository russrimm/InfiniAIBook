import { expect, test, type Page } from "@playwright/test";

/**
 * Icon-only and emoji-only controls are the usual way a screen reader ends up
 * announcing "button" with no purpose. This walks the main screens and fails
 * on any visible control whose accessible name has no letters or digits once
 * emoji are ignored, and on any image without an alt attribute.
 */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const hasWords = (s: string) => /[\p{L}\p{N}]/u.test(s.replace(/\p{Extended_Pictographic}/gu, ""));
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute("aria-label");
      if (aria) return aria;
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        return el.labels?.[0]?.textContent || el.getAttribute("title") || "";
      }
      const img = el.querySelector("img[alt]")?.getAttribute("alt") ?? "";
      return `${(el as HTMLElement).innerText ?? ""} ${img} ${el.getAttribute("title") ?? ""}`.trim();
    };
    const controls = "button, a[href], [role=button], [role=tab], [role=checkbox], input:not([type=hidden]), select, textarea";
    document.querySelectorAll(controls).forEach((el) => {
      const box = (el as HTMLElement).getBoundingClientRect();
      if (!box.width || !box.height) return;
      if (!hasWords(nameOf(el))) out.push(el.outerHTML.slice(0, 140).replace(/\s+/g, " "));
    });
    document.querySelectorAll("img:not([alt])").forEach((el) => out.push(`image without alt: ${el.outerHTML.slice(0, 100)}`));
    return out;
  });
}

test("the unnamed-control check catches an emoji-only button and a bare image", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", '<button id="x">🔎</button><button aria-label="Named">✕</button><img src="/x.png">');
  });
  const found = await unnamedControls(page);
  expect(found).toHaveLength(2);
  expect(found.join(" ")).toContain('id="x"');
  expect(found.join(" ")).toContain("image without alt");
});

test("every visible control on the main screens has an accessible name", async ({ page }) => {
  test.setTimeout(180_000);
  const created = await page.request.post("/api/notebooks", { data: { title: "Accessible names" } });
  const { id } = (await created.json()) as { id: string };
  for (const title of ["Leaf pigments", "Soil chemistry"]) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title, text: `${title} describes how plants use light. `.repeat(20) },
    });
  }
  const sourceIds = ((await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { id: string }[] }).sources.map((s) => s.id);
  await page.request.post("/api/generate", { data: { notebookId: id, type: "infographic", sourceIds } });

  const problems: Record<string, string[]> = {};
  const check = async (screen: string) => {
    const found = await unnamedControls(page);
    if (found.length) problems[screen] = found;
  };

  await page.goto("/");
  await check("home");
  await page.goto("/search");
  await check("search");

  await page.goto(`/notebook/${id}`);
  await expect(page.getByRole("banner")).toBeVisible();
  await check("notebook");

  const sources = page.getByRole("complementary", { name: "Sources", exact: true });
  await page.getByRole("banner").getByRole("button", { name: /^Sources/ }).click();
  await expect(sources.getByRole("checkbox")).toHaveCount(2);
  await check("sources list");
  await sources.getByRole("button", { name: "Add sources", exact: true }).click();
  await sources.getByRole("button", { name: /Paste text/ }).click();
  await check("add sources");

  await page.getByRole("banner").getByRole("button", { name: "Help and about" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await check("about");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await check("command palette");
  await page.keyboard.press("Escape");

  await page.getByRole("banner").getByRole("button", { name: /^Models/ }).click();
  await expect(page.getByRole("dialog", { name: "Models" })).toBeVisible();
  await check("models");
  await page.keyboard.press("Escape");

  await page.getByRole("complementary", { name: "Studio" }).getByRole("button", { name: /^Library/ }).click();
  await page.getByRole("button", { name: /^Infographic|Accessible names|infographic/i }).first().click();
  const viewer = page.getByRole("dialog").filter({ has: page.locator("[data-infographic-style]") });
  await expect(viewer).toBeVisible();
  await check("infographic viewer");

  expect(problems).toEqual({});
});
