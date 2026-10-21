import { describe, expect, it } from "vitest";

import {
  addNodesSchema,
  moveNodeSchema,
  MAX_TITLES_PER_ADD,
  nodeIdSchema,
  nodeTitlesSchema,
  nodeDetailsSchema,
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

describe("nodeDetailsSchema", () => {
  const valid = { title: "Um", summary: "", goalPages: "" };

  it.each([
    [
      "a title alone",
      { title: "  Um  " },
      { title: "Um", summary: null, goalPages: null },
    ],
    [
      "a multi-line summary and a goal typed in the form",
      { title: "Um", summary: "  Linha 1\n\tLinha 2 ", goalPages: " 30 " },
      { title: "Um", summary: "Linha 1\n\tLinha 2", goalPages: 30 },
    ],
    [
      "a goal sent as a number",
      { ...valid, goalPages: 10_000 },
      { title: "Um", summary: null, goalPages: 10_000 },
    ],
    [
      "blank fields as nothing",
      { ...valid, summary: "   ", goalPages: "  " },
      { title: "Um", summary: null, goalPages: null },
    ],
    [
      "a null goal",
      { ...valid, goalPages: null },
      { title: "Um", summary: null, goalPages: null },
    ],
  ])("accepts %s", (_name, input, expected) => {
    expect(nodeDetailsSchema.parse(input)).toEqual(expected);
  });

  it.each([
    ["a blank title", { ...valid, title: " " }, "titleRequired"],
    ["a long title", { ...valid, title: "a".repeat(201) }, "titleTooLong"],
    [
      "a line break in the title",
      { ...valid, title: "a\nb" },
      "invalidCharacters",
    ],
    [
      "a long summary",
      { ...valid, summary: "a".repeat(1001) },
      "summaryTooLong",
    ],
    [
      "a NUL in the summary",
      { ...valid, summary: "a\u0000b" },
      "invalidCharacters",
    ],
    [
      "a bidi override in the summary",
      { ...valid, summary: "a\u202Eb" },
      "invalidCharacters",
    ],
    ["a zero goal", { ...valid, goalPages: "0" }, "goalInvalid"],
    ["a negative goal", { ...valid, goalPages: -5 }, "goalInvalid"],
    ["a fractional goal", { ...valid, goalPages: "2.5" }, "goalInvalid"],
    ["a goal over the limit", { ...valid, goalPages: "10001" }, "goalInvalid"],
    [
      "a goal that is not a number",
      { ...valid, goalPages: "trinta" },
      "goalInvalid",
    ],
    [
      "a goal in exponent notation",
      { ...valid, goalPages: "1e3" },
      "goalInvalid",
    ],
    ["an infinite goal", { ...valid, goalPages: Infinity }, "goalInvalid"],
    ["a goal of the wrong type", { ...valid, goalPages: true }, "goalInvalid"],
    [
      "a very long goal",
      { ...valid, goalPages: "9".repeat(1000) },
      "goalInvalid",
    ],
  ])("refuses %s", (_name, input, error) => {
    expect(errorOf(nodeDetailsSchema.safeParse(input))).toBe(error);
  });
});

describe("nodeIdSchema", () => {
  it.each(["not-a-uuid", "1' or '1'='1", "", 42, null])("refuses %j", (id) => {
    expect(nodeIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("moveNodeSchema", () => {
  const id = "0b6f8f5e-5c55-4f0a-9d8e-2f1f2b7f3c11";

  it.each([
    [{ parentId: null, index: 0 }],
    [{ parentId: id, index: 3 }],
    [{ parentId: id, index: 2000 }],
  ])("accepts %j", (input) => {
    expect(moveNodeSchema.parse(input)).toEqual(input);
  });

  it.each([
    ["a malformed parent", { parentId: "nope", index: 0 }],
    ["a missing parent", { index: 0 }],
    ["a negative index", { parentId: null, index: -1 }],
    ["a fractional index", { parentId: null, index: 1.5 }],
    ["an index past any book", { parentId: null, index: 2001 }],
    ["an index as text", { parentId: null, index: "1" }],
  ])("refuses %s", (_name, input) => {
    expect(moveNodeSchema.safeParse(input).success).toBe(false);
  });
});
