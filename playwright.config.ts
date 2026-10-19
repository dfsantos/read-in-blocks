import { defineConfig, devices } from "@playwright/test";

import { E2E_ALLOWLIST } from "./tests/e2e/identity";

const port = 3000;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm start",
    url: `http://localhost:${port}`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    // The server under test allows only the seeded E2E accounts (US-005: requireUser() re-checks the
    // allowlist on every request). Overrides AUTH_ALLOWED_EMAILS from the job or .env.local.
    env: { AUTH_ALLOWED_EMAILS: E2E_ALLOWLIST },
  },
});
