import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    environment: "node",
    // On this Windows/Node 24 setup vitest workers occasionally die with a native 0xC0000409
    // (roughly 1 run in 10, in a random file, either pool). It is runner-specific: the app
    // itself survives 20k+ requests against a real server. Re-run if a run dies without failures.
    pool: "threads",
    env: {
      JWT_SECRET: "test-secret",
      NODE_ENV: "test",
      // DateTime.Now in ESS_Backend is the host's local time (Malaysia).
      TZ: "Asia/Kuala_Lumpur",
    },
  },
});
