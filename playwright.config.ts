import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3123);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MOCK_LLM_PORT = Number(process.env.MOCK_LLM_PORT || 3124);
const MOCK_LLM_URL = `http://127.0.0.1:${MOCK_LLM_PORT}`;
const MOCK_VIDEO_PORT = Number(process.env.MOCK_VIDEO_PORT || 3125);
const MOCK_VIDEO_URL = `http://127.0.0.1:${MOCK_VIDEO_PORT}`;

// A throwaway database, so end-to-end runs never touch the developer's .data/.
const dataDir =
  process.env.E2E_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "infiniaibook-e2e-"));

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/mock-llm.mjs",
      url: `${MOCK_LLM_URL}/health`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_LLM_PORT: String(MOCK_LLM_PORT) },
    },
    {
      command: "node e2e/mock-video.mjs",
      url: `${MOCK_VIDEO_URL}/health`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_VIDEO_PORT: String(MOCK_VIDEO_PORT) },
    },
    {
      command: `npx next dev -H 127.0.0.1 -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        DATA_DIR: dataDir,
        NEXT_TELEMETRY_DISABLED: "1",
        // The app must not require a password for these tests.
        INFINIAIBOOK_PASSWORD: "",
        // Point every model call at the local mock in e2e/mock-llm.mjs.
        AI_PROVIDER: "",
        AI_BASE_URL: `${MOCK_LLM_URL}/v1`,
        DAILY_BUDGET_USD: "0",
        // The cost confirmation has its own spec (e2e/cost-cancel.spec.ts); other flows should not stop to ask.
        COST_CONFIRM_USD: "0",
        AI_API_KEY: "e2e",
        AI_MODEL: "mock-chat",
        AI_VISION_MODEL: "mock-vision",
        // The Videos API stand-in in e2e/mock-video.mjs; polls fast so tests are quick.
        AI_VIDEO_BASE_URL: `${MOCK_VIDEO_URL}/v1`,
        AI_VIDEO_API_KEY: "e2e-video-key",
        AI_VIDEO_MODEL: "mock-video",
        AI_VIDEO_DURATIONS: "4,8",
        VIDEO_CLIP_POLL_SECONDS: "1",
      },
    },
  ],
});
