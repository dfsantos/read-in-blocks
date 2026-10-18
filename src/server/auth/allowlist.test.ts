import { describe, expect, it } from "vitest";

import { createAllowlist, decideSignIn } from "./allowlist";

const allowlist = createAllowlist([
  "Reader@Example.com",
  " second@example.com ",
]);

describe("decideSignIn", () => {
  it("allows a verified e-mail on the allowlist, ignoring case and spaces", () => {
    expect(
      decideSignIn(
        { email: " READER@example.COM", emailVerified: true },
        allowlist,
      ),
    ).toEqual({
      allowed: true,
    });
    expect(
      decideSignIn(
        { email: "second@example.com", emailVerified: true },
        allowlist,
      ),
    ).toEqual({
      allowed: true,
    });
  });

  it("refuses an e-mail that is not on the allowlist", () => {
    expect(
      decideSignIn(
        { email: "outsider@example.com", emailVerified: true },
        allowlist,
      ),
    ).toEqual({
      allowed: false,
      reason: "not_allowlisted",
    });
  });

  it("refuses an unverified e-mail even when it is on the allowlist", () => {
    expect(
      decideSignIn(
        { email: "reader@example.com", emailVerified: false },
        allowlist,
      ),
    ).toEqual({
      allowed: false,
      reason: "email_unverified",
    });
  });

  it("refuses everyone when the allowlist is empty", () => {
    expect(
      decideSignIn(
        { email: "reader@example.com", emailVerified: true },
        createAllowlist([]),
      ),
    ).toEqual({ allowed: false, reason: "not_allowlisted" });
  });

  it("does not match by substring or domain", () => {
    expect(
      decideSignIn(
        { email: "xreader@example.com", emailVerified: true },
        allowlist,
      ).allowed,
    ).toBe(false);
    expect(
      decideSignIn({ email: "example.com", emailVerified: true }, allowlist)
        .allowed,
    ).toBe(false);
  });
});
