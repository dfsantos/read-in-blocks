import { describe, expect, it } from "vitest";

import {
  BOOK_AUTHOR_MAX,
  BOOK_TITLE_MAX,
  bookIdSchema,
  bookInputSchema,
} from "./book-input";

type Case = [
  name: string,
  input: unknown,
  expected: { ok: true; data: unknown } | { ok: false; errors: string[] },
];

function parse(input: unknown) {
  const result = bookInputSchema.safeParse(input);
  return result.success
    ? { ok: true as const, data: result.data }
    : {
        ok: false as const,
        errors: result.error.issues.map(
          (issue) => `${issue.path.join(".")}:${issue.message}`,
        ),
      };
}

describe("bookInputSchema", () => {
  const cases: Case[] = [
    [
      "title only",
      { title: "Domain-Driven Design" },
      { ok: true, data: { title: "Domain-Driven Design", author: null } },
    ],
    [
      "title and author, trimmed",
      { title: "  Refactoring ", author: " Martin Fowler  " },
      { ok: true, data: { title: "Refactoring", author: "Martin Fowler" } },
    ],
    [
      "blank author becomes null",
      { title: "SICP", author: "   " },
      { ok: true, data: { title: "SICP", author: null } },
    ],
    [
      "title at the limit",
      { title: "a".repeat(BOOK_TITLE_MAX) },
      { ok: true, data: { title: "a".repeat(BOOK_TITLE_MAX), author: null } },
    ],
    [
      "author at the limit",
      { title: "t", author: "a".repeat(BOOK_AUTHOR_MAX) },
      { ok: true, data: { title: "t", author: "a".repeat(BOOK_AUTHOR_MAX) } },
    ],
    ["missing title", {}, { ok: false, errors: ["title:titleRequired"] }],
    [
      "empty title",
      { title: "" },
      { ok: false, errors: ["title:titleRequired"] },
    ],
    [
      "blank title",
      { title: "   " },
      { ok: false, errors: ["title:titleRequired"] },
    ],
    [
      "title of another type",
      { title: 42 },
      { ok: false, errors: ["title:titleRequired"] },
    ],
    [
      "title over the limit",
      { title: "a".repeat(BOOK_TITLE_MAX + 1) },
      { ok: false, errors: ["title:titleTooLong"] },
    ],
    [
      "spaces do not count toward the limit",
      { title: ` ${"a".repeat(BOOK_TITLE_MAX)} ` },
      { ok: true, data: { title: "a".repeat(BOOK_TITLE_MAX), author: null } },
    ],
    [
      "author over the limit",
      { title: "t", author: "a".repeat(BOOK_AUTHOR_MAX + 1) },
      { ok: false, errors: ["author:authorTooLong"] },
    ],
    [
      "author of another type",
      { title: "t", author: ["x"] },
      { ok: false, errors: ["author:authorTooLong"] },
    ],
    [
      "unknown keys such as an owner are dropped",
      { title: "t", ownerId: "someone-else", id: "x" },
      { ok: true, data: { title: "t", author: null } },
    ],
    [
      "not an object",
      "title",
      { ok: false, errors: [expect.stringMatching(/^:/)] },
    ],
  ];

  it.each(cases)("%s", (_name, input, expected) => {
    expect(parse(input)).toEqual(expected);
  });
});

describe("bookIdSchema", () => {
  it.each([
    ["a uuid", "0b6f8f5e-5c55-4f0a-9d8e-2f1f2b7f3c11", true],
    ["an empty string", "", false],
    ["a sql fragment", "1' or '1'='1", false],
    ["a path", "../etc", false],
    ["a uuid with extra text", "0b6f8f5e-5c55-4f0a-9d8e-2f1f2b7f3c11x", false],
  ])("%s", (_name, value, valid) => {
    expect(bookIdSchema.safeParse(value).success).toBe(valid);
  });
});
