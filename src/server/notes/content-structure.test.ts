import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { parseNoteContent, textToDoc } from "@/domain/notes/rich-text";
import { noteExtensions } from "@/lib/note-extensions";

import { fitsEditorSchema } from "./content-structure";

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

describe("fitsEditorSchema", () => {
  it("offers exactly the nodes and marks the domain schema accepts", () => {
    const schema = getSchema(noteExtensions());
    expect(Object.keys(schema.nodes).sort()).toEqual(
      [
        "blockquote",
        "bulletList",
        "codeBlock",
        "doc",
        "hardBreak",
        "heading",
        "listItem",
        "orderedList",
        "paragraph",
        "text",
      ].sort(),
    );
    expect(Object.keys(schema.marks).sort()).toEqual(
      ["bold", "code", "italic", "link"].sort(),
    );
  });

  it("accepts a converted US-018 note", () => {
    expect(fitsEditorSchema(textToDoc("Uma\n\nduas"))).toBe(true);
  });

  it.each([
    [
      "a list item starting with a list",
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph("a")] }],
              },
            ],
          },
        ],
      },
    ],
    [
      "a code block inside a heading's place in a list",
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "codeBlock", content: [{ type: "text", text: "x" }] },
            ],
          },
        ],
      },
    ],
  ])("refuses %s, which the domain schema lets through", (_name, block) => {
    const parsed = parseNoteContent({ type: "doc", content: [block] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(fitsEditorSchema(parsed.content)).toBe(false);
  });
});
