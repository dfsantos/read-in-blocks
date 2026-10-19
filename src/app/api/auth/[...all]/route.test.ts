// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Better Auth must never see a refused write: the guard answers first.
const handler = vi.fn(async () => new Response("ok"));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: handler, POST: handler }),
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({}) }));

import { POST } from "./route";

const ORIGIN = "http://localhost:3000";

function post(headers: Record<string, string>) {
  return new Request(`${ORIGIN}/api/auth/sign-in/social`, {
    method: "POST",
    headers,
  });
}

describe("POST /api/auth/* (US-028)", () => {
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
});
