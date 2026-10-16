import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Integration tests read TEST_* variables from the environment (CI) or from
// .env.test.local (local runs). Only TEST_* keys are loaded.
const integrationEnv = loadEnv("test", process.cwd(), "TEST_");

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/integration/global-setup.ts"],
          env: integrationEnv,
          // Tests share one database; run files one at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
