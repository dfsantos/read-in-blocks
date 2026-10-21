import { describe, expect, it } from "vitest";

import { NOTE_BODY_MAX, noteIdSchema, noteInputSchema } from "./note-input";

const errorOf = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => (result.success ? undefined : result.error?.issues[0].message);

describe("noteInputSchema", () => {
  it.each([
    ["one line", "Ideia central", "Ideia central"],
    ["trimmed at both ends", "  Ideia \n", "Ideia"],
    [
      "inner line breaks and tabs",
      "Primeira linha\r\n\n\tSegunda",
      "Primeira linha\r\n\n\tSegunda",
    ],
    [
      "a body at the length limit",
      "a".repeat(NOTE_BODY_MAX),
      "a".repeat(NOTE_BODY_MAX),
    ],
    [
      "markup, kept as plain text",
      "<script>alert(1)</script>",
      "<script>alert(1)</script>",
    ],
  ])("accepts %s", (_name, body, expected) => {
    expect(noteInputSchema.parse({ body })).toEqual({ body: expected });
  });

  it.each([
    ["nothing", "", "bodyRequired"],
    ["only blanks", " \n\t ", "bodyRequired"],
    ["not a string", 42, "bodyRequired"],
    ["a missing body", undefined, "bodyRequired"],
    ["a body over the limit", "a".repeat(NOTE_BODY_MAX + 1), "bodyTooLong"],
    ["a NUL character", "Nota\u0000", "invalidCharacters"],
    ["a bidirectional override", "Nota‮dcba", "invalidCharacters"],
    ["U+2066 (isolate)", "Nota⁦", "invalidCharacters"],
  ])("refuses %s", (_name, body, error) => {
    expect(errorOf(noteInputSchema.safeParse({ body }))).toBe(error);
  });
});

describe("noteIdSchema", () => {
  it.each([
    ["a UUID", "8d6b2b9e-4f1a-4c7e-9b1d-2f3a4b5c6d7e", true],
    ["anything else", "1; drop table note", false],
    ["a number", 1, false],
  ])("%s", (_name, value, valid) => {
    expect(noteIdSchema.safeParse(value).success).toBe(valid);
  });
});
