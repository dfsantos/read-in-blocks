import { describe, expect, it } from "vitest";

import { parseAuthEnv } from "./env";

const SECRET = "x".repeat(32);

describe("parseAuthEnv", () => {
  it("reads a complete production configuration", () => {
    const env = parseAuthEnv({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_URL: "https://read-in-blocks.vercel.app",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      AUTH_ALLOWED_EMAILS: "reader@example.com, Second@Example.com",
    });
    expect(env.secret).toBe(SECRET);
    expect(env.baseURL).toBe("https://read-in-blocks.vercel.app");
    expect(env.google).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    expect([...env.allowlist]).toEqual([
      "reader@example.com",
      "second@example.com",
    ]);
  });

  it("treats a missing or empty allowlist as deny-all", () => {
    expect(parseAuthEnv({}).allowlist.size).toBe(0);
    expect(parseAuthEnv({ AUTH_ALLOWED_EMAILS: " , " }).allowlist.size).toBe(0);
  });

  it("leaves Google sign-in off when its credentials are absent (Preview, ADR-0016)", () => {
    expect(
      parseAuthEnv({ BETTER_AUTH_SECRET: SECRET, GOOGLE_CLIENT_ID: "" }).google,
    ).toBeUndefined();
  });

  it("requires the secret in production", () => {
    expect(() => parseAuthEnv({ NODE_ENV: "production" })).toThrow(
      /BETTER_AUTH_SECRET is required/,
    );
  });

  it("rejects a short secret, a half-configured Google client and a non-http URL", () => {
    expect(() => parseAuthEnv({ BETTER_AUTH_SECRET: "short" })).toThrow(
      /at least 32 characters/,
    );
    expect(() => parseAuthEnv({ GOOGLE_CLIENT_ID: "client-id" })).toThrow(
      /both GOOGLE_CLIENT_ID/,
    );
    expect(() =>
      parseAuthEnv({ BETTER_AUTH_URL: "ftp://example.com" }),
    ).toThrow(/http\(s\) URL/);
  });

  it("rejects other base URL variables that Better Auth would use without validation", () => {
    expect(() =>
      parseAuthEnv({ NEXT_PUBLIC_BETTER_AUTH_URL: "https://evil.example" }),
    ).toThrow(/unset NEXT_PUBLIC_BETTER_AUTH_URL/);
    expect(() => parseAuthEnv({ BASE_URL: "https://evil.example" })).toThrow(
      /unset BASE_URL/,
    );
    expect(() => parseAuthEnv({ BASE_URL: "/" })).not.toThrow();
  });

  it("rejects an invalid allowlist entry instead of skipping it", () => {
    expect(() =>
      parseAuthEnv({ AUTH_ALLOWED_EMAILS: "reader@example.com, not-an-email" }),
    ).toThrow(/invalid e-mail/);
  });

  it("never puts a value in its error messages", () => {
    const secretValue = "s3cret-value";
    let message = "";
    try {
      parseAuthEnv({
        BETTER_AUTH_SECRET: secretValue,
        AUTH_ALLOWED_EMAILS: "private@example",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(secretValue);
    expect(message).not.toContain("private@example");
  });
});
