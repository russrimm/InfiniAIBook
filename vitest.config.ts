import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  // tsconfig keeps JSX for Next to compile; tests need it compiled here.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    // node:sqlite keeps one handle per process; separate forks keep each
    // file's temporary database isolated.
    pool: "forks",
  },
});
