// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAllowlist } from "./allowlist";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  log: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./log", () => ({ logAuthEvent: mocks.log }));
vi.mock("./index", () => ({
  getAuth: () => ({
    api: { getSession: mocks.getSession, signOut: mocks.signOut },
  }),
  getAuthEnv: () => ({ allowlist: createAllowlist(["reader@example.test"]) }),
}));

import { checkSession, findSessionUser, requireUser } from "./session";

const allowlist = createAllowlist(["reader@example.test"]);

function session(
  user: Partial<NonNullable<Parameters<typeof checkSession>[0]>["user"]> = {},
) {
  return {
    user: {
      id: "user-1",
      name: "Ada Reader",
      email: "reader@example.test",
      emailVerified: true,
      image: "https://lh3.googleusercontent.com/a/photo",
      ...user,
    },
  };
}

describe("checkSession", () => {
  it("returns the reader for a valid session", () => {
    expect(checkSession(session(), allowlist)).toEqual({
      status: "ok",
      user: {
        id: "user-1",
        name: "Ada Reader",
        email: "reader@example.test",
        image: "https://lh3.googleusercontent.com/a/photo",
      },
    });
  });

  it("treats no session as anonymous", () => {
    expect(checkSession(null, allowlist)).toEqual({ status: "anonymous" });
  });

  it("denies an e-mail removed from the allowlist", () => {
    expect(
      checkSession(session({ email: "gone@example.test" }), allowlist),
    ).toEqual({ status: "denied", reason: "not_allowlisted" });
  });

  it("denies an unverified e-mail", () => {
    expect(checkSession(session({ emailVerified: false }), allowlist)).toEqual({
      status: "denied",
      reason: "email_unverified",
    });
  });

  it.each([
    ["http URL", "http://lh3.googleusercontent.com/a/photo"],
    ["javascript URL", "javascript:alert(1)"],
    ["data URL", "data:image/png;base64,AAAA"],
    ["not a URL", "photo.png"],
    ["empty", ""],
    ["missing", null],
  ])("drops an image that is a %s", (_, image) => {
    const check = checkSession(session({ image }), allowlist);
    expect(check).toMatchObject({ status: "ok", user: { image: null } });
  });
});

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
  });

  it("returns the reader of a valid session", async () => {
    mocks.getSession.mockResolvedValue(session());

    await expect(requireUser()).resolves.toMatchObject({ id: "user-1" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects to the login page without a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("revokes and refuses a session whose e-mail left the allowlist", async () => {
    mocks.getSession.mockResolvedValue(session({ email: "gone@example.test" }));

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.log).toHaveBeenCalledWith({
      event: "auth.session_revoked",
      reason: "not_allowlisted",
      userId: "user-1",
    });
  });
});

describe("findSessionUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
  });

  it("returns undefined instead of redirecting", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(findSessionUser()).resolves.toBeUndefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
