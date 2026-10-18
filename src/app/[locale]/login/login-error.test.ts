import { describe, expect, it } from "vitest";

import { loginErrorKey } from "./login-error";

describe("loginErrorKey", () => {
  it("shows nothing without an error", () => {
    expect(loginErrorKey(undefined)).toBeUndefined();
  });

  it("maps a refused account to the generic refusal message", () => {
    expect(loginErrorKey("account_not_allowed")).toBe("errors.notAllowed");
  });

  it("maps a cancel on Google's consent screen", () => {
    expect(loginErrorKey("access_denied")).toBe("errors.cancelled");
  });

  it("maps anything else, including arrays and injected text, to the generic failure", () => {
    expect(loginErrorKey("invalid_code")).toBe("errors.failed");
    expect(loginErrorKey("<script>alert(1)</script>")).toBe("errors.failed");
    expect(loginErrorKey(["account_not_allowed", "x"])).toBe("errors.failed");
  });
});
