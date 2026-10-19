import { describe, expect, it } from "vitest";

import { isPublicPath, loginURL, safeNextPath } from "./routes";

describe("isPublicPath", () => {
  it("only lets the login page through, with or without the locale", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/pt-BR/login")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/pt-BR")).toBe(false);
    expect(isPublicPath("/login/extra")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/books/1")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps paths on this site, with the query", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/books/1")).toBe("/books/1");
    expect(safeNextPath("/books?tab=notes")).toBe("/books?tab=notes");
    expect(safeNextPath("/pt-BR/books")).toBe("/pt-BR/books");
  });

  it.each([
    ["absolute URL", "https://evil.example/"],
    ["scheme-relative URL", "//evil.example/"],
    ["backslash host", "/\\evil.example"],
    ["backslashes", "\\\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path", "books"],
    ["tab inside", "/\t/evil.example"],
    ["newline inside", "/books\n"],
    ["null byte", "/books\u0000"],
    ["login page", "/login"],
    ["localized login page", "/pt-BR/login?next=/"],
    ["API route", "/api/auth/sign-out"],
    ["API root", "/api"],
    ["empty", ""],
    ["too long", `/${"a".repeat(2048)}`],
    // Dot segments that normalize to `//host` (security review of US-005).
    ["dot-dot then double slash", "/..//evil.example"],
    ["encoded dot-dot then double slash", "/%2e%2e//evil.example"],
    ["dot then double slash", "/.//evil.example"],
    ["segment, dot-dot, double slash", "/a/..//evil.example"],
    ["locale, dot-dot, double slash", "/pt-BR/..//evil.example"],
    ["encoded slash", "/%2f%2fevil.example"],
    ["encoded backslash", "/%5cevil.example"],
    ["encoded API route", "/%61pi/auth/get-session"],
  ])("refuses %s", (_, value) => {
    expect(safeNextPath(value)).toBeUndefined();
  });

  it("refuses non-strings, such as repeated query parameters", () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(["/books", "/other"])).toBeUndefined();
    expect(safeNextPath(42)).toBeUndefined();
  });

  it("drops the hash, which Better Auth refuses in callbackURL", () => {
    expect(safeNextPath("/books?tab=notes#n1")).toBe("/books?tab=notes");
  });

  it("normalizes dot segments without leaving the site", () => {
    expect(safeNextPath("/books/../../x")).toBe("/x");
    expect(safeNextPath("/./login")).toBeUndefined();
  });
});

describe("loginURL", () => {
  const base = "http://localhost:3000/books";

  it("remembers the destination", () => {
    expect(loginURL(base, "/books?tab=notes").href).toBe(
      "http://localhost:3000/login?next=%2Fbooks%3Ftab%3Dnotes",
    );
  });

  it("omits the library, which is already the default", () => {
    expect(loginURL(base, "/").href).toBe("http://localhost:3000/login");
  });

  it("drops an unsafe destination", () => {
    expect(loginURL(base, "//evil.example").href).toBe(
      "http://localhost:3000/login",
    );
  });
});
