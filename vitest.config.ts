import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // Database-backed tests share one SQLite file, so run files serially.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      NODE_ENV: "test",
      DEV_AUTH_BYPASS: "false",
    },
    testTimeout: 30_000,
  },
});
