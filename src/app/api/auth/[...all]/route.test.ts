// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Better Auth must never see a refused write: the guard answers first.
const handler = vi.fn(async () => new Response("ok"));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: handler, POST: handler }),
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({}) }));

import { GET, POST } from "./route";

const ORIGIN = "http://localhost:3000";

function post(headers: Record<string, string>) {
  return new Request(`${ORIGIN}/api/auth/sign-in/social`, {
    method: "POST",
    headers,
  });
}

describe("/api/auth/* (US-028)", () => {
  beforeEach(() => handler.mockClear());

  it("refuses another origin and oversized bodies without calling Better Auth", async () => {
    const crossSite = await POST(
      post({ origin: "https://evil.example", "content-length": "10" }),
    );
    const oversized = await POST(
      post({ origin: ORIGIN, "content-length": `${1024 * 1024}` }),
    );

    expect(crossSite.status).toBe(403);
    expect(oversized.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands a same-origin write to Better Auth", async () => {
    const response = await POST(
      post({ origin: ORIGIN, "content-length": "10" }),
    );

    expect(await response.text()).toBe("ok");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("marks every Better Auth response private and never stored", async () => {
    const read = await GET(new Request(`${ORIGIN}/api/auth/get-session`));
    const write = await POST(post({ origin: ORIGIN, "content-length": "10" }));

    expect(read.headers.get("cache-control")).toBe("private, no-store");
    expect(write.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    ["GET", "/api/auth/random-path"],
    ["GET", "/api/auth/sign-in/social"],
    ["GET", "/api/auth/get-session/"],
    ["POST", "/api/auth/sign-out"],
    ["POST", "/api/auth/get-session"],
    ["POST", `/api/auth/${"x".repeat(4000)}`],
  ])(
    "answers %s %s with 404 without calling Better Auth",
    async (method, path) => {
      const request = new Request(`${ORIGIN}${path}`, {
        method,
        headers: { origin: ORIGIN, "content-length": "0" },
      });
      const response = await (method === "GET" ? GET : POST)(request);

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(handler).not.toHaveBeenCalled();
    },
  );
});
