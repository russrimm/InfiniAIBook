import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Automated accessibility checks with axe-core on the main screens, in the
 * dark and light themes, at desktop width and at 390px. They cover what a
 * click-through cannot: color contrast, landmarks and region structure,
 * heading order, labels, ARIA validity and focusable scroll areas. Anything
 * axe reports as a violation fails the run, with the rule, the elements and a
 * link to how to fix it.
 *
 * Color contrast needs real pixels, so animations are disabled before
 * scanning: a fading-in dialog would otherwise be measured half transparent.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function settle(page: Page) {
  await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
  await page.waitForTimeout(150);
}

async function scan(page: Page, label: string): Promise<string[]> {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => {
    const nodes = v.nodes
      .slice(0, 3)
      .map((n) => `${n.target.join(" ")} — ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)}`)
      .join(" | ");
    return `[${label}] ${v.id} (${v.impact}): ${v.help} · ${v.nodes.length} element(s): ${nodes}`;
  });
}

async function notebook(page: Page, title: string) {
  const created = await page.request.post("/api/notebooks", { data: { title } });
  const { id } = (await created.json()) as { id: string };
  for (const title of ["Garden pilot", "Soil chemistry", "Field notes", "Interview: botanist", "Interview: farmer", "Weather logs"]) {
    await page.request.post(`/api/notebooks/${id}/sources`, {
      data: { title, text: `${title} says the Riverside garden pilot builds 24 raised beds in April 2025. `.repeat(8) },
    });
  }
  const sourceIds = ((await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { id: string }[] }).sources.map((s) => s.id);
  await page.request.post("/api/generate", { data: { notebookId: id, type: "infographic", sourceIds, title: "Garden pilot at a glance" } });
  await page.request.post("/api/generate", { data: { notebookId: id, type: "faq", sourceIds, title: "Garden FAQ" } });
  return id;
}

const COMBOS = [
  { scheme: "dark", width: 1280, height: 860 },
  { scheme: "light", width: 1280, height: 860 },
  { scheme: "dark", width: 390, height: 844 },
  { scheme: "light", width: 390, height: 844 },
] as const;

for (const { scheme, width, height } of COMBOS) {
  test(`axe finds no violations: ${scheme} theme at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width, height });
    const title = `Accessibility audit ${scheme} ${width}`;
    const id = await notebook(page, title);
    const narrow = width < 600;
    const problems: string[] = [];
    const check = async (label: string) => void problems.push(...(await scan(page, `${scheme} ${width}px ${label}`)));

    await page.goto("/");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await check("home");

    await page.goto("/search");
    await expect(page.getByRole("main")).toBeVisible();
    await check("search");

    await page.goto(`/notebook/${id}`);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Question" })).toBeVisible();
    await check("notebook chat");

    // Sources
    if (narrow) await page.getByRole("navigation", { name: "Notebook panels" }).getByRole("button", { name: /^sources/i }).click();
    else await page.getByRole("banner").getByRole("button", { name: /^Sources/ }).click();
    await expect(page.getByRole("complementary", { name: "Sources", exact: true }).getByRole("checkbox").first()).toBeVisible();
    await check("sources");
    if (narrow) await page.getByRole("navigation", { name: "Notebook panels" }).getByRole("button", { name: /^chat/i }).click();
    else await page.keyboard.press("Escape");

    // Studio and Library
    if (narrow) await page.getByRole("navigation", { name: "Notebook panels" }).getByRole("button", { name: /^studio/i }).click();
    const studio = page.getByRole("complementary", { name: "Studio" });
    await expect(studio).toBeVisible();
    await check("studio create");
    await studio.getByRole("button", { name: /^Library/ }).click();
    await expect(studio.getByRole("button", { name: /^Delete / }).first()).toBeVisible();
    await check("studio library");

    // An artifact reader and the regenerate dialog
    await studio.getByRole("listitem").first().getByRole("button").first().click();
    const reader = page.getByRole("dialog").first();
    await expect(reader).toBeVisible();
    await check("artifact reader");
    await reader.getByRole("button", { name: "Regenerate…" }).click();
    await expect(page.getByRole("dialog", { name: /^Regenerate/ })).toBeVisible();
    await check("regenerate dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /^Regenerate/ })).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Dialogs: shortcuts and help
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await check("shortcuts");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("option").first()).toBeVisible();
    await check("command palette");
    await page.keyboard.press("Escape");

    expect(problems, problems.join("\n")).toEqual([]);
  });
}
