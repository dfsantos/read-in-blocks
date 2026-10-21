import { describe, expect, it } from "vitest";

import {
  addNodesSchema,
  MAX_TITLES_PER_ADD,
  nodeIdSchema,
  nodeTitlesSchema,
  renameNodeSchema,
} from "./node-input";

const errorOf = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => (result.success ? undefined : result.error?.issues[0].message);

describe("nodeTitlesSchema", () => {
  it.each([
    ["one title", "Introdução", ["Introdução"]],
    [
      "one title per line, trimmed, blank lines skipped",
      "  1. Introdução \n\n2. Modelos\r\n   \n3. Testes",
      ["1. Introdução", "2. Modelos", "3. Testes"],
    ],
    [
      "tabs from a copied table of contents",
      "1\tIntrodução\t\t9",
      ["1 Introdução  9"],
    ],
    [
      "the maximum number of titles",
      Array.from({ length: MAX_TITLES_PER_ADD }, (_, i) => `C${i}`).join("\n"),
      Array.from({ length: MAX_TITLES_PER_ADD }, (_, i) => `C${i}`),
    ],
    ["a title at the length limit", "a".repeat(200), ["a".repeat(200)]],
  ])("accepts %s", (_name, text, titles) => {
    expect(nodeTitlesSchema.parse(text)).toEqual(titles);
  });

  it.each([
    ["nothing", "", "titlesRequired"],
    ["only blank lines", " \n\t\n  ", "titlesRequired"],
    ["not a string", 42, "titlesRequired"],
    [
      "too many titles",
      Array.from({ length: MAX_TITLES_PER_ADD + 1 }, (_, i) => `C${i}`).join(
        "\n",
      ),
      "tooManyTitles",
    ],
    ["a huge text", "a\n".repeat(20_000), "tooManyTitles"],
    ["a line over the limit", `ok\n${"a".repeat(201)}`, "titleTooLong"],
    ["a NUL character", "Intro\u0000", "invalidCharacters"],
    ["a bidirectional override", "Intro\u202Edcba", "invalidCharacters"],
    ["U+202A (embedding)", "Intro\u202A", "invalidCharacters"],
    ["U+2066 (isolate)", "Intro\u2066", "invalidCharacters"],
    ["U+2069 (pop isolate)", "Intro\u2069", "invalidCharacters"],
  ])("refuses %s", (_name, text, error) => {
    expect(errorOf(nodeTitlesSchema.safeParse(text))).toBe(error);
  });
});

describe("addNodesSchema", () => {
  it.each(["part", "chapter", "topic"])("accepts the kind %s", (kind) => {
    expect(addNodesSchema.parse({ kind, titles: "A" })).toEqual({
      kind,
      titles: ["A"],
    });
  });

  it.each(["book", "", "PART", null])("refuses the kind %j", (kind) => {
    expect(addNodesSchema.safeParse({ kind, titles: "A" }).success).toBe(false);
  });
});

describe("renameNodeSchema", () => {
  it.each([
    ["a blank title", "  ", "titleRequired"],
    ["a long title", "a".repeat(201), "titleTooLong"],
    ["a line break", "a\nb", "invalidCharacters"],
    ["not a string", 1, "titleRequired"],
  ])("refuses %s", (_name, title, error) => {
    expect(errorOf(renameNodeSchema.safeParse({ title }))).toBe(error);
  });

  it("trims the title", () => {
    expect(renameNodeSchema.parse({ title: "  Novo  " })).toEqual({
      title: "Novo",
    });
  });
});

describe("nodeIdSchema", () => {
  it.each(["not-a-uuid", "1' or '1'='1", "", 42, null])("refuses %j", (id) => {
    expect(nodeIdSchema.safeParse(id).success).toBe(false);
  });
});
