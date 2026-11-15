import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // tsconfig keeps JSX for Next to compile; tests need it compiled here.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    // node:sqlite keeps one handle per process; separate forks keep each
    // file's temporary database isolated.
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      // Count source files no test imports yet, so untested code lowers the
      // percentages instead of being invisible.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts"],
      // Floors just under the measured baseline (statements 42.6, branches
      // 37.0, functions 36.7, lines 43.5). Raise them as tests are added.
      thresholds: {
        statements: 41,
        branches: 36,
        functions: 35,
        lines: 42,
      },
    },
  },
});
