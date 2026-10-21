import { describe, expect, it } from "vitest";

import { NOTE_REFERENCE_MAX, parseNoteKind } from "./note-type";

describe("parseNoteKind", () => {
  it.each([
    [
      "a key concept",
      "key_concept",
      undefined,
      { type: "key_concept", reference: null },
    ],
    [
      "an action or question",
      "action_or_question",
      undefined,
      { type: "action_or_question", reference: null },
    ],
    [
      "a quote with its page",
      "quote",
      "p. 42",
      { type: "quote", reference: "p. 42" },
    ],
    [
      "a quote with a trimmed position",
      "quote",
      "  posição 1234 ",
      { type: "quote", reference: "posição 1234" },
    ],
    [
      "a reference at the limit",
      "quote",
      "a".repeat(NOTE_REFERENCE_MAX),
      { type: "quote", reference: "a".repeat(NOTE_REFERENCE_MAX) },
    ],
    [
      "a key concept, dropping a reference",
      "key_concept",
      "p. 42",
      { type: "key_concept", reference: null },
    ],
    [
      "an action, dropping a malformed reference",
      "action_or_question",
      42,
      { type: "action_or_question", reference: null },
    ],
  ])("accepts %s", (_name, type, reference, kind) => {
    expect(parseNoteKind(type, reference)).toEqual({ ok: true, kind });
  });

  it.each([
    ["a quote without reference", "quote", undefined, "referenceRequired"],
    ["a quote with a null reference", "quote", null, "referenceRequired"],
    ["a quote with a blank reference", "quote", "   ", "referenceRequired"],
    [
      "a reference over the limit",
      "quote",
      "a".repeat(NOTE_REFERENCE_MAX + 1),
      "referenceTooLong",
    ],
    ["a reference that is not text", "quote", ["p. 1"], "referenceInvalid"],
    [
      "a reference with a line break",
      "quote",
      "p. 1\np. 2",
      "referenceInvalid",
    ],
    [
      "a reference with a bidirectional override",
      "quote",
      "p. ‮24",
      "referenceInvalid",
    ],
    ["a zero-width space", "quote", "\u200B", "referenceInvalid"],
    ["a direction mark", "quote", "p. 12\u200F–40", "referenceInvalid"],
    ["a byte order mark inside", "quote", "p.\uFEFF1", "referenceInvalid"],
    ["an unknown type", "summary", undefined, "invalidType"],
    ["a type in another case", "QUOTE", "p. 1", "invalidType"],
    ["no type", undefined, undefined, "invalidType"],
    ["a type that is not text", 1, undefined, "invalidType"],
  ])("refuses %s", (_name, type, reference, error) => {
    expect(parseNoteKind(type, reference)).toEqual({ ok: false, error });
  });
});
