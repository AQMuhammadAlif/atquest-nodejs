import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    env: {
      JWT_SECRET: "test-secret",
      NODE_ENV: "test",
    },
  },
});
