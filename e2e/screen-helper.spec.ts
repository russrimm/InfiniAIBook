import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * The screen helper end to end, in a real browser.
 *
 * `getDisplayMedia` is replaced with a canvas stream that draws a small fake
 * "app", so no permission prompt appears and the test controls what is on
 * screen. Most tests mock /api/screen-help to script the model's replies; one
 * runs the real route against e2e/mock-llm.mjs, a local OpenAI-compatible
 * stand-in, so no AI provider is needed.
 */

declare global {
  interface Window {
    __setScreen: (name: "editor" | "dialog") => void;
    __endShare: () => void;
    __shareCalls: number;
  }
}

async function fakeScreenShare(page: Page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    let screen: "editor" | "dialog" = "editor";

    const draw = () => {
      ctx.fillStyle = "#f4f6fa";
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, 1280, 64);
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(1100, 12, 160, 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px sans-serif";
      ctx.fillText("Share", 1150, 39);
      if (screen === "dialog") {
        ctx.fillStyle = "#111827";
        ctx.fillRect(340, 160, 600, 400);
        ctx.fillStyle = "#ffffff";
        ctx.fillText("Share with people", 380, 220);
      }
    };
    draw();
    // A canvas stream only emits frames when the canvas is painted. Captured
    // before page.clock replaces the timers, so it keeps running in real time.
    const realSetInterval = window.setInterval.bind(window);
    realSetInterval(draw, 100);

    let stream: MediaStream | null = null;
    window.__shareCalls = 0;
    window.__setScreen = (name) => {
      screen = name;
      draw();
    };
    window.__endShare = () => {
      const track = stream?.getVideoTracks()[0];
      track?.stop();
      track?.dispatchEvent(new Event("ended"));
    };
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => {
        window.__shareCalls++;
        stream = canvas.captureStream(10);
        return stream;
      },
    });
  });
}

type Sent = {
  goal: string;
  message?: string;
  trigger: "ask" | "watch";
  history: { role: string; text: string }[];
  frame: string;
  width: number;
  height: number;
};

/** Mock the model; `replies` are used in order, the last one repeats. */
async function mockHelper(page: Page, replies: Record<string, unknown>[]) {
  const sent: Sent[] = [];
  await page.route("**/api/screen-help", async (route: Route) => {
    sent.push(route.request().postDataJSON() as Sent);
    const reply = replies[Math.min(sent.length - 1, replies.length - 1)];
    const status = typeof reply.httpStatus === "number" ? reply.httpStatus : 200;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(reply) });
  });
  return sent;
}

/**
 * With a fake clock, advance it in steps while giving the real stream time to
 * deliver frames, until `done` holds or the attempts run out.
 */
async function advanceUntil(page: Page, done: () => boolean, stepMs = 2500, attempts = 20) {
  for (let i = 0; i < attempts && !done(); i++) {
    await page.waitForTimeout(150);
    await page.clock.runFor(stepMs);
  }
}

const FIRST_STEP = {
  status: "next_step",
  say: "This looks like a document editor. Sharing starts from the **Share** button.",
  step: "Click the blue Share button at the top right.",
  // 1100,12 160×40 on a 1280×720 frame.
  target: { x: 0.8594, y: 0.0167, w: 0.125, h: 0.0556, label: "Share" },
};

async function openHelperAndAsk(page: Page, goal: string) {
  await page.getByRole("button", { name: /screen helper/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /screen helper/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("What do you need help with?").fill(goal);
  await dialog.getByRole("button", { name: "Share screen & ask" }).click();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await fakeScreenShare(page);
});

test("coaches from the shared screen and highlights the next control", async ({ page }) => {
  const sent = await mockHelper(page, [
    FIRST_STEP,
    { status: "next_step", say: "Now type their email.", step: "Type an email address in the box.", target: null },
  ]);
  await page.goto("/");
  const dialog = await openHelperAndAsk(page, "Share this document with my team");

  await expect(dialog.getByText("Click the blue Share button at the top right.")).toBeVisible();
  const box = dialog.getByTestId("screen-highlight");
  await expect(box).toBeVisible();
  await expect(box).toContainText("Share");
  await expect(dialog.getByText(/the box is approximate/)).toBeVisible();

  // The highlight sits over the right part of the screenshot.
  const img = await dialog.getByAltText("Screenshot the helper analyzed").boundingBox();
  const hl = await box.boundingBox();
  expect(img && hl).toBeTruthy();
  expect((hl!.x - img!.x) / img!.width).toBeCloseTo(0.8594, 2);
  expect((hl!.y - img!.y) / img!.height).toBeCloseTo(0.0167, 2);

  expect(sent[0].trigger).toBe("ask");
  expect(sent[0].goal).toBe("Share this document with my team");
  expect(sent[0].frame).toMatch(/^data:image\/jpeg;base64,/);
  expect(sent[0].width).toBe(1280);
  expect(sent[0].height).toBe(720);
  expect(sent[0].history).toEqual([]);

  // A follow-up sends a fresh frame and the conversation so far.
  await dialog.getByRole("button", { name: "I did that. What's next?" }).click();
  await expect(dialog.getByText("Type an email address in the box.")).toBeVisible();
  expect(sent[1].trigger).toBe("ask");
  expect(sent[1].message).toBe("I did that. What's next?");
  expect(sent[1].goal).toBe("Share this document with my team");
  expect(sent[1].history.map((h) => h.role)).toEqual(["user", "assistant"]);
  expect(sent[1].history[1].text).toContain("Next step: Click the blue Share button");
  await expect(dialog.getByTestId("helper-turn")).toHaveCount(2);
});

test("auto-watch suggests the next step after the screen changes", async ({ page }) => {
  await page.clock.install();
  const sent = await mockHelper(page, [
    FIRST_STEP,
    {
      status: "next_step",
      say: "The sharing dialog is open.",
      step: "Type a name in Share with people.",
      target: { x: 380, y: 200, w: 300, h: 30, label: "Share with people" },
    },
  ]);
  await page.goto("/");
  const dialog = await openHelperAndAsk(page, "Share this document");
  await dialog.getByLabel("Auto-watch").check();
  await advanceUntil(page, () => sent.length >= 1, 500);
  await expect(dialog.getByText("Click the blue Share button at the top right.")).toBeVisible();

  // Nothing changed: no automatic call, however long we wait.
  await advanceUntil(page, () => false, 2500, 6);
  expect(sent).toHaveLength(1);

  await page.evaluate(() => window.__setScreen("dialog"));
  await advanceUntil(page, () => sent.length >= 2);
  expect(sent).toHaveLength(2);
  expect(sent[1].trigger).toBe("watch");
  expect(sent[1].message).toBeUndefined();
  await expect(dialog.getByText("Noticed a change on your screen")).toBeVisible();
  await expect(dialog.getByTestId("screen-highlight")).toContainText("Share with people");
});

test("hides unchanged check-ins and can be switched off", async ({ page }) => {
  await page.clock.install();
  const sent = await mockHelper(page, [FIRST_STEP, { status: "unchanged", say: "", step: null, target: null }]);
  await page.goto("/");
  const dialog = await openHelperAndAsk(page, "Share this document");
  await dialog.getByLabel("Auto-watch").check();
  await advanceUntil(page, () => sent.length >= 1, 500);
  await expect(dialog.getByTestId("helper-turn")).toHaveCount(1);

  await page.evaluate(() => window.__setScreen("dialog"));
  await advanceUntil(page, () => sent.length >= 2);
  expect(sent[1]?.trigger).toBe("watch");
  await expect(dialog.getByText(/no new step yet/)).toBeVisible();
  await expect(dialog.getByTestId("helper-turn")).toHaveCount(1);

  await dialog.getByLabel("Auto-watch").uncheck();
  await page.evaluate(() => window.__setScreen("editor"));
  await advanceUntil(page, () => false, 5000, 6);
  expect(sent).toHaveLength(2);
});

test("notices when the user stops sharing from the browser", async ({ page }) => {
  await mockHelper(page, [FIRST_STEP]);
  await page.goto("/");
  const dialog = await openHelperAndAsk(page, "Share this document");
  await expect(dialog.getByTestId("screen-highlight")).toBeVisible();

  await page.evaluate(() => window.__endShare());
  await expect(dialog.getByText("Sharing stopped")).toBeVisible();
  await dialog.getByRole("button", { name: "Share screen", exact: true }).click();
  await expect(dialog.getByText("Sharing", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__shareCalls)).toBe(2);
});

test("shows a clear error when the model cannot read images", async ({ page }) => {
  await mockHelper(page, [
    {
      httpStatus: 400,
      code: "vision",
      error: '"text-only" did not actually read the screenshot. Choose a vision-capable model under Models → Image reading.',
    },
  ]);
  await page.goto("/");
  const dialog = await openHelperAndAsk(page, "Share this document");
  await expect(dialog.getByRole("alert")).toContainText("Models → Image reading");
});

test("runs the real route against an OpenAI-compatible vision model", async ({ page, request }) => {
  // No /api/screen-help mock: e2e/mock-llm.mjs plays the model.
  const llm = `http://127.0.0.1:${process.env.MOCK_LLM_PORT || 3124}`;
  await page.goto("/");
  const dialog = await openHelperAndAsk(page, "Share this document");

  await expect(dialog.getByText("Click Share at the top right.")).toBeVisible();
  const img = await dialog.getByAltText("Screenshot the helper analyzed").boundingBox();
  const hl = await dialog.getByTestId("screen-highlight").boundingBox();
  // Pixels from the model (1100 of 1280) became a fraction of the frame.
  expect((hl!.x - img!.x) / img!.width).toBeCloseTo(1100 / 1280, 2);

  const last = (await (await request.get(`${llm}/last`)).json()) as {
    model: string;
    jsonMode: boolean;
    system: string;
    roles: string[];
    hasImage: boolean;
    detail: string;
    prompt: string;
  };
  expect(last.model).toBe("mock-vision");
  expect(last.jsonMode).toBe(true);
  expect(last.system).toContain("software coach");
  expect(last.roles).toEqual(["system", "user"]);
  expect(last.hasImage).toBe(true);
  expect(last.detail).toBe("high");
  expect(last.prompt).toContain("The user's goal: Share this document");
  expect(last.prompt).toContain("1280 × 720");
});

test("the route rejects malformed turns", async ({ request }) => {
  const res = await request.post("/api/screen-help", {
    data: { goal: "Help", trigger: "ask", frame: "https://example.com/a.png", width: 10, height: 10 },
  });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/not a valid image/);
});

test("saves a session as a note in the notebook", async ({ page, request }) => {
  const created = await request.post("/api/notebooks", { data: { title: "Screen helper e2e" } });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };

  await mockHelper(page, [FIRST_STEP]);
  await page.goto(`/notebook/${id}`);
  const dialog = await openHelperAndAsk(page, "Share this document with my team");
  await expect(dialog.getByTestId("screen-highlight")).toBeVisible();

  await dialog.getByRole("button", { name: "Save as note" }).click();
  await expect(dialog.getByRole("button", { name: "Saved as note" })).toBeDisabled();

  const res = await request.get(`/api/notebooks/${id}/notes`);
  const { notes } = (await res.json()) as { notes: { title: string; content: string; kind: string }[] };
  const note = notes.find((n) => n.title.startsWith("Screen help:"));
  expect(note).toBeTruthy();
  expect(note!.kind).toBe("ai");
  expect(note!.content).toContain("1. Click the blue Share button at the top right.");
  expect(note!.content).not.toContain("data:image");
});
