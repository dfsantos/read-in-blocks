import { describe, expect, it } from "vitest";

import {
  API_CSP,
  createNonce,
  pageCsp,
  STATIC_SECURITY_HEADERS,
} from "./security-headers";

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split("; ").map((directive) => {
      const [name, ...values] = directive.split(" ");
      return [name, values.join(" ")];
    }),
  );
}

describe("pageCsp", () => {
  const production = directives(
    pageCsp({ nonce: "abc123", dev: false, https: true }),
  );

  it("runs scripts only with the request's nonce", () => {
    expect(production.get("script-src")).toBe(
      "'self' 'nonce-abc123' 'strict-dynamic'",
    );
    expect(production.get("style-src")).toBe("'self' 'nonce-abc123'");
  });

  it("never allows eval or inline code in production", () => {
    const csp = pageCsp({ nonce: "abc123", dev: false, https: true });
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("forbids framing, plugins and foreign forms or base URLs", () => {
    expect(production.get("frame-ancestors")).toBe("'none'");
    expect(production.get("object-src")).toBe("'none'");
    expect(production.get("base-uri")).toBe("'self'");
    expect(production.get("form-action")).toBe("'self'");
    expect(production.get("default-src")).toBe("'self'");
  });

  it("upgrades insecure requests only over https", () => {
    expect(production.has("upgrade-insecure-requests")).toBe(true);
    const local = directives(
      pageCsp({ nonce: "abc123", dev: false, https: false }),
    );
    expect(local.has("upgrade-insecure-requests")).toBe(false);
  });

  it("relaxes scripts and styles in next dev only", () => {
    const dev = directives(
      pageCsp({ nonce: "abc123", dev: true, https: false }),
    );
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("style-src")).toBe("'self' 'unsafe-inline'");
  });
});

describe("static headers", () => {
  const headers = new Map(
    STATIC_SECURITY_HEADERS.map(({ key, value }) => [key, value]),
  );

  it("sets HSTS, nosniff, the referrer policy and a minimal permissions policy", () => {
    expect(headers.get("Strict-Transport-Security")).toMatch(
      /^max-age=\d{8,}; includeSubDomains$/,
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Permissions-Policy")).toContain("microphone=()");
    expect(headers.get("Permissions-Policy")).toContain("geolocation=()");
  });

  it("blocks everything on API responses", () => {
    expect(API_CSP).toBe("default-src 'none'; frame-ancestors 'none'");
  });
});

describe("createNonce", () => {
  it("is 128 random bits, different on every call", () => {
    const nonces = new Set(Array.from({ length: 100 }, createNonce));
    expect(nonces.size).toBe(100);
    for (const nonce of nonces) {
      expect(Buffer.from(nonce, "base64")).toHaveLength(16);
    }
  });
});
