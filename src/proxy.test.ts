// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// next-intl's middleware does not load under plain Node ESM; locale routing is not under test here.
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

import proxy from "./proxy";

const ORIGIN = "http://localhost:3000";

function request(path: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("proxy", () => {
  it("sends an anonymous visitor to the login page, remembering the page", () => {
    const response = proxy(request("/books/1?tab=notes"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/login?next=%2Fbooks%2F1%3Ftab%3Dnotes`,
    );
  });

  it("sends an anonymous visitor of the home page to the plain login page", () => {
    const response = proxy(request("/"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
  });

  it("lets anyone open the login page", () => {
    const response = proxy(request("/login"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a request with a session cookie through (the page checks the session)", () => {
    for (const cookie of [
      "better-auth.session_token=any-value",
      "__Secure-better-auth.session_token=any-value",
    ]) {
      const response = proxy(request("/books/1", cookie));
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("ignores cookies with other names", () => {
    const response = proxy(request("/books/1", "session_token=any-value"));

    expect(response.headers.get("location")).toContain("/login");
  });
});
