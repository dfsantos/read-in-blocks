import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestEnv } from "./db-env";

async function loadRoute() {
  // Fresh module graph so each test gets its own lazily created pool.
  vi.resetModules();
  return import("@/app/api/health/route");
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports ok when the app role reaches the migrated database", async () => {
    vi.stubEnv("DATABASE_URL", requireTestEnv("TEST_DATABASE_URL"));
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("reports only a generic error when the database is unreachable", async () => {
    const url = new URL(requireTestEnv("TEST_DATABASE_URL"));
    url.password = "wrong-password";
    vi.stubEnv("DATABASE_URL", url.toString());
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ status: "error" });
    expect(body).not.toContain(url.hostname);
  });

  it("reports a generic error when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error" });
  });
});
