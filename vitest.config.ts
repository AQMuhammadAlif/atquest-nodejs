import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    env: {
      JWT_SECRET: "test-secret",
      NODE_ENV: "test",
      ESS_ACTING_EMPLOYEE_ID: "58308791-89FB-45D1-8A9E-72E430F8E677",
      ESS_ACTING_IS_ESS_ADMIN: "true",
    },
  },
});
