import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // Files share one Redis + one app server, and one file deliberately breaks storage.
    fileParallelism: false,
  },
});
