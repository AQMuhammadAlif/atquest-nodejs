import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The default "forks" pool intermittently crashes on Windows (worker exit 0xC0000409);
    // worker threads are stable here.
    pool: "threads",
    env: {
      JWT_SECRET: "test-secret",
      NODE_ENV: "test",
    },
  },
});
