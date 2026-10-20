import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_BODY_BYTES, guardWrite } from "./request-guard";

const ORIGIN = "http://localhost:3000";

function post(headers: Record<string, string>) {
  return new Request(`${ORIGIN}/api/auth/sign-in/social`, {
    method: "POST",
    headers,
  });
}

const sameOrigin = { origin: ORIGIN, "content-length": "42" };

describe("guardWrite", () => {
  it("lets a same-origin write with a small body through", () => {
    expect(guardWrite(post(sameOrigin))).toBeUndefined();
    expect(
      guardWrite(post({ ...sameOrigin, "sec-fetch-site": "same-origin" })),
    ).toBeUndefined();
  });

  it.each([
    ["another origin", { ...sameOrigin, origin: "https://evil.example" }],
    ["another port", { ...sameOrigin, origin: "http://localhost:3001" }],
    ["an opaque origin", { ...sameOrigin, origin: "null" }],
    ["no origin", { "content-length": "42" }],
    ["a cross-site fetch", { ...sameOrigin, "sec-fetch-site": "cross-site" }],
    ["a same-site fetch", { ...sameOrigin, "sec-fetch-site": "same-site" }],
  ])("refuses %s with 403", (_, headers) => {
    expect(guardWrite(post(headers))?.status).toBe(403);
  });

  it.each([
    ["no Content-Length", { origin: ORIGIN }],
    ["a malformed Content-Length", { origin: ORIGIN, "content-length": "1e9" }],
  ])("refuses %s with 411", (_, headers) => {
    expect(guardWrite(post(headers))?.status).toBe(411);
  });

  it("refuses a body over the limit with 413, before reading it", () => {
    const over = {
      ...sameOrigin,
      "content-length": `${DEFAULT_MAX_BODY_BYTES + 1}`,
    };
    expect(guardWrite(post(over))?.status).toBe(413);
    expect(
      guardWrite(post({ ...sameOrigin, "content-length": "200" }), 100)?.status,
    ).toBe(413);
  });

  it("answers with an empty, uncached body", async () => {
    const response = guardWrite(post({ "content-length": "1" }));
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.text()).toBe("");
  });
});
