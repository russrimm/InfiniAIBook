import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3123);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MOCK_LLM_PORT = Number(process.env.MOCK_LLM_PORT || 3124);
const MOCK_LLM_URL = `http://127.0.0.1:${MOCK_LLM_PORT}`;

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
        AI_API_KEY: "e2e",
        AI_MODEL: "mock-chat",
        AI_VISION_MODEL: "mock-vision",
      },
    },
  ],
});
