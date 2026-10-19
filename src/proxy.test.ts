// @vitest-environment node
// Next 16.4 still names it unstable_doesMiddlewareMatch (the docs call it unstable_doesProxyMatch).
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// next-intl's middleware does not load under plain Node ESM; locale routing is not under test here.
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

import proxy, { config } from "./proxy";

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

describe("proxy security headers (US-028)", () => {
  const cases = [
    ["a redirect to login", request("/books/1")],
    ["the login page", request("/login")],
    [
      "a page with a session",
      request("/books/1", "better-auth.session_token=x"),
    ],
  ] as const;

  it.each(cases)("sets a nonce CSP and no-store on %s", (_, incoming) => {
    const response = proxy(incoming);
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(csp).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/]{22}==' 'strict-dynamic'/,
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("hands the same nonce to the page through the request headers", () => {
    const incoming = request("/login");
    const response = proxy(incoming);
    const nonce = incoming.headers.get("x-nonce");

    expect(nonce).toBeTruthy();
    expect(incoming.headers.get("content-security-policy")).toBe(
      response.headers.get("content-security-policy"),
    );
    expect(response.headers.get("content-security-policy")).toContain(
      `'nonce-${nonce}'`,
    );
  });

  it("uses a new nonce on every request", () => {
    const csp = () =>
      proxy(request("/login")).headers.get("content-security-policy");

    expect(csp()).not.toBe(csp());
  });

  it("upgrades insecure requests only on https", () => {
    const secure = proxy(new NextRequest("https://example.test/login"));

    expect(secure.headers.get("content-security-policy")).toContain(
      "upgrade-insecure-requests",
    );
    expect(
      proxy(request("/login")).headers.get("content-security-policy"),
    ).not.toContain("upgrade-insecure-requests");
  });
});

describe("proxy matcher (US-028)", () => {
  const runs = (url: string) =>
    unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

  it.each([
    "/",
    "/login",
    "/books/42",
    "/books/v1.2/notes",
    "/apiary",
    "/a.b/c",
  ])("runs on the page %s, so it gets the CSP and no-store", (url) => {
    expect(runs(url)).toBe(true);
  });

  it.each([
    "/api/health",
    "/api/auth/get-session",
    "/_next/static/chunk.js",
    "/_vercel/insights/script.js",
    "/favicon.ico",
    "/images/cover.png",
  ])("skips %s (API routes, internals and files)", (url) => {
    expect(runs(url)).toBe(false);
  });
});
