import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function openChat(page: Page, request: APIRequestContext) {
  const notebook = await request.post("/api/notebooks", { data: { title: "Chat actions" } });
  const { id } = (await notebook.json()) as { id: string };
  const source = await request.post(`/api/notebooks/${id}/sources`, {
    data: { title: "Garden pilot", text: "The Riverside garden pilot builds 24 raised beds in April 2025. A drip kit costs $640." },
  });
  expect(source.ok()).toBeTruthy();
  await page.goto(`/notebook/${id}`);
  await expect(page.getByLabel("Question")).toBeEnabled();
  return id;
}

const ask = async (page: Page, question: string) => {
  await page.getByLabel("Question").fill(question);
  await page.getByRole("button", { name: "Send", exact: true }).click();
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The mock LLM numbers each repeat of a question, so a redone answer reads differently. */
const answerTo = (page: Page, question: string) =>
  page.getByText(new RegExp(`Answer \\d+ to "${escapeRegExp(question)}"`));

const savedMessages = async (page: Page, notebookId: string) => {
  const nb = await (await page.request.get(`/api/notebooks/${notebookId}`)).json();
  const chat = await (await page.request.get(`/api/sessions/${nb.sessions[0].id}`)).json();
  return chat.messages as { role: string; content: string }[];
};

test("copy, regenerate, follow-ups, edit and export work on a chat", async ({ page, request }) => {
  const notebookId = await openChat(page, request);
  const tag = Date.now().toString(36);
  const first = `How many beds ${tag}?`;
  const edited = `How many raised beds ${tag} in total?`;

  await ask(page, first);
  await expect(answerTo(page, first)).toBeVisible();

  // Follow-ups arrive after the answer without blocking it.
  const followUps = page.getByRole("group", { name: "Suggested follow-up questions" });
  await expect(followUps.getByRole("button")).toHaveCount(3);

  // Copy keeps the citations readable and confirms briefly.
  await page.getByRole("button", { name: "Copy this answer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`to "${first}"`);
  expect(copied).toContain("**Sources**");
  expect(copied).toMatch(/\[1\] Garden pilot \(part 1\)/);

  // Regenerate replaces the answer rather than adding another.
  const before = await answerTo(page, first).innerText();
  await page.getByRole("button", { name: "Regenerate this answer" }).click();
  await expect(answerTo(page, first)).not.toHaveText(before);
  await expect(answerTo(page, first)).toHaveCount(1);
  expect((await savedMessages(page, notebookId)).map((m) => m.role)).toEqual(["user", "assistant"]);

  // A suggestion is sent as the next question.
  await expect(followUps.getByRole("button", { name: "What does a drip kit cost?" })).toBeVisible();
  await followUps.getByRole("button", { name: "What does a drip kit cost?" }).click();
  await expect(answerTo(page, "What does a drip kit cost?")).toBeVisible();
  expect(await savedMessages(page, notebookId)).toHaveLength(4);

  // Editing an early question asks first; declining changes nothing.
  await page.getByRole("button", { name: "Edit and resend your message" }).first().click();
  const editor = page.getByLabel("Edit your message");
  await editor.fill(edited);
  await page.getByRole("button", { name: "Send edited message" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Edit and resend this message?" });
  await expect(confirm).toContainText("3 messages");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(editor).toBeVisible();
  expect(await savedMessages(page, notebookId)).toHaveLength(4);

  // Confirming drops everything after it and answers the new question.
  await page.getByRole("button", { name: "Send edited message" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Edit and resend" }).click();
  await expect(answerTo(page, edited)).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit and resend your message" })).toHaveCount(1);
  const after = await savedMessages(page, notebookId);
  expect(after.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(after[0].content).toBe(edited);

  // The whole chat downloads as Markdown with its sources.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export this chat as Markdown" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^how-many-raised-beds-.*-in-total\.md$/);
  const markdown = await readFile((await file.path())!, "utf8");
  expect(markdown).toContain(`# ${edited}`);
  expect(markdown).toContain(`> ${edited}`);
  expect(markdown).toContain("- [1] Garden pilot (part 1)");
});
