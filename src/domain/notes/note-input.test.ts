import { describe, expect, it } from "vitest";

import { noteIdSchema, noteInputSchema } from "./note-input";
import { textToDoc } from "./rich-text";

const errorOf = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => (result.success ? undefined : result.error?.issues[0].message);

// The detailed cases of the content live in rich-text.test.ts; these check the form's wrapper.
describe("noteInputSchema", () => {
  it("gives the rebuilt document and its plain text", () => {
    const content = textToDoc("Ideia\ncentral");
    expect(
      noteInputSchema.parse({
        content,
        type: "quote",
        reference: " p. 7 ",
        extra: "x",
      }),
    ).toEqual({
      content,
      text: "Ideia\ncentral",
      type: "quote",
      reference: "p. 7",
    });
  });

  it.each([
    ["no content", { type: "key_concept" }, "bodyRequired"],
    ["not an object", "text", "bodyRequired"],
    [
      "a US-018 body instead of content",
      { type: "key_concept", body: "Ideia" },
      "bodyRequired",
    ],
    [
      "HTML as content",
      { type: "key_concept", content: "<p>Ideia</p>" },
      "invalidContent",
    ],
    ["no type", { content: textToDoc("Ideia") }, "invalidType"],
    [
      "an invalid type",
      { type: "todo", content: textToDoc("Ideia") },
      "invalidType",
    ],
    [
      "a quote without reference",
      { type: "quote", content: textToDoc("Ideia") },
      "referenceRequired",
    ],
  ])("refuses %s", (_name, input, error) => {
    expect(errorOf(noteInputSchema.safeParse(input))).toBe(error);
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
