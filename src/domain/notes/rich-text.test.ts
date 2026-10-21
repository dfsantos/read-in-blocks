import { describe, expect, it } from "vitest";

import {
  isSafeHref,
  NOTE_TEXT_MAX,
  parseNoteContent,
  plainText,
  storedNoteContent,
  textToDoc,
  type NoteDoc,
} from "./rich-text";

const paragraph = (text: string, marks?: unknown[]) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});
const docOf = (...content: unknown[]) => ({ type: "doc", content });
const link = (href: string) =>
  docOf(paragraph("site", [{ type: "link", attrs: { href } }]));

const errorOf = (value: unknown) => {
  const parsed = parseNoteContent(value);
  return parsed.ok ? undefined : parsed.error;
};

// Everything the toolbar offers, as the editor serializes it (with Tiptap's extra attributes).
const EVERYTHING = docOf(
  {
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text: "Título" }],
  },
  {
    type: "heading",
    attrs: { level: 4 },
    content: [{ type: "text", text: "Sub" }],
  },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "negrito", marks: [{ type: "bold" }] },
      { type: "hardBreak" },
      { type: "text", text: "itálico", marks: [{ type: "italic" }] },
      { type: "text", text: "x()", marks: [{ type: "code" }] },
      {
        type: "text",
        text: "link",
        marks: [
          {
            type: "link",
            attrs: {
              href: "https://example.com/a?b=1",
              target: "_blank",
              rel: "noopener noreferrer nofollow",
              class: null,
              title: null,
            },
          },
        ],
      },
    ],
  },
  { type: "paragraph" },
  {
    type: "bulletList",
    content: [{ type: "listItem", content: [paragraph("um")] }],
  },
  {
    type: "orderedList",
    attrs: { start: 3, type: null },
    content: [
      {
        type: "listItem",
        content: [
          paragraph("dois"),
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [paragraph("aninhado")] }],
          },
        ],
      },
    ],
  },
  { type: "blockquote", content: [paragraph("citação")] },
  {
    type: "codeBlock",
    attrs: { language: "typescript" },
    content: [{ type: "text", text: "const a = 1;\nconst b = 2;" }],
  },
);

describe("parseNoteContent", () => {
  it("accepts everything the toolbar offers and drops extra attributes", () => {
    const parsed = parseNoteContent(EVERYTHING);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const linkMark = (
      parsed.content.content[2] as { content: { marks?: unknown[] }[] }
    ).content[4].marks;
    expect(linkMark).toEqual([
      { type: "link", attrs: { href: "https://example.com/a?b=1" } },
    ]);
    expect(parsed.content.content[5]).toMatchObject({ attrs: { start: 3 } });
    expect(parsed.text).toBe(
      [
        "Título",
        "Sub",
        "negrito\nitálicox()link",
        "",
        "um",
        "dois\naninhado",
        "citação",
        "const a = 1;\nconst b = 2;",
      ].join("\n"),
    );
  });

  it.each([
    [
      "onclick on a node",
      {
        type: "paragraph",
        attrs: { onclick: "x" },
        content: [{ type: "text", text: "a" }],
      },
    ],
    [
      "style on a text",
      { type: "paragraph", content: [{ type: "text", text: "a", style: "x" }] },
    ],
  ])("drops %s", (_name, node) => {
    const parsed = parseNoteContent(docOf(node));
    expect(parsed).toEqual({
      ok: true,
      content: docOf(paragraph("a")),
      text: "a",
    });
  });

  it.each([
    ["a language outside the list", "brainfuck", null],
    ["a language that is not text", 42, null],
    ["a missing language", undefined, null],
    ["a listed language", "python", "python"],
  ])("keeps a code block with %s", (_name, language, expected) => {
    const parsed = parseNoteContent(
      docOf({
        type: "codeBlock",
        attrs: { language },
        content: [{ type: "text", text: "x" }],
      }),
    );
    expect(parsed.ok && parsed.content.content[0]).toEqual({
      type: "codeBlock",
      attrs: { language: expected },
      content: [{ type: "text", text: "x" }],
    });
  });

  it.each([
    ["nothing", undefined, "bodyRequired"],
    ["null", null, "bodyRequired"],
    ["an empty paragraph", docOf({ type: "paragraph" }), "bodyRequired"],
    ["only blanks", docOf(paragraph("  \t ")), "bodyRequired"],
    ["a string", "<p>oi</p>", "invalidContent"],
    ["an empty document", docOf(), "invalidContent"],
    [
      "a node outside the schema",
      docOf({ type: "html", content: "<script>" }),
      "invalidContent",
    ],
    [
      "an image",
      docOf({ type: "image", attrs: { src: "x", onerror: "alert(1)" } }),
      "invalidContent",
    ],
    [
      "an iframe",
      docOf({ type: "iframe", attrs: { src: "https://evil" } }),
      "invalidContent",
    ],
    [
      "a mark outside the schema",
      docOf(paragraph("a", [{ type: "highlight" }])),
      "invalidContent",
    ],
    [
      "a heading level outside the list",
      docOf({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "a" }],
      }),
      "invalidContent",
    ],
    [
      "an empty text node",
      docOf({ type: "paragraph", content: [{ type: "text", text: "" }] }),
      "invalidContent",
    ],
    [
      "a text over the limit",
      docOf(paragraph("a".repeat(NOTE_TEXT_MAX + 1))),
      "invalidContent",
    ],
    [
      "a note over the text limit",
      docOf(paragraph("a".repeat(NOTE_TEXT_MAX)), paragraph("b")),
      "bodyTooLong",
    ],
    ["a NUL character", docOf(paragraph("a\u0000b")), "invalidCharacters"],
    ["a bidirectional override", docOf(paragraph("a‮b")), "invalidCharacters"],
    [
      "a JSON over the size limit",
      docOf(
        ...Array.from({ length: 4_000 }, () =>
          paragraph("a", [{ type: "bold" }, { type: "italic" }]),
        ),
      ),
      "contentTooLarge",
    ],
  ])("refuses %s", (_name, value, error) => {
    expect(errorOf(value)).toBe(error);
  });

  it("drops marks inside a code block", () => {
    const parsed = parseNoteContent(
      docOf({
        type: "codeBlock",
        content: [{ type: "text", text: "a", marks: [{ type: "bold" }] }],
      }),
    );
    expect(parsed.ok && parsed.content.content[0]).toEqual({
      type: "codeBlock",
      attrs: { language: null },
      content: [{ type: "text", text: "a" }],
    });
  });

  it("refuses a document nested past the depth limit without recursing", () => {
    let node: unknown = paragraph("fundo");
    for (let i = 0; i < 100_000; i += 1) {
      node = { type: "blockquote", content: [node] };
    }
    expect(errorOf(docOf(node))).toBe("contentTooLarge");
  });

  it("accepts lists nested within the depth limit", () => {
    let node: unknown = paragraph("fundo");
    // Ten levels: 2 (doc) + 10 × 4 (list, items, item, content) + 3 (paragraph) JSON levels.
    for (let i = 0; i < 10; i += 1) {
      node = {
        type: "bulletList",
        content: [{ type: "listItem", content: [node] }],
      };
    }
    expect(parseNoteContent(docOf(node)).ok).toBe(true);
  });

  // Known XSS payloads for links (OWASP filter evasion cheat sheet): all refused.
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\nscript:alert(1)",
    "java\tscript:alert(1)",
    "\u0001javascript:alert(1)",
    "javascript&colon;alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example.com",
    "/relative",
    "https://exa mple.com",
    "",
  ])("refuses the link %j", (href) => {
    expect(errorOf(link(href))).toBe("invalidLink");
  });

  it.each([
    "https://example.com",
    "http://example.com/path?q=1#x",
    "mailto:leitor@example.com",
  ])("accepts the link %j", (href) => {
    expect(parseNoteContent(link(href)).ok).toBe(true);
  });

  it("keeps markup typed as text: it is only text", () => {
    const parsed = parseNoteContent(
      docOf(paragraph("<script>alert(1)</script>")),
    );
    expect(parsed).toMatchObject({
      ok: true,
      text: "<script>alert(1)</script>",
    });
  });
});

describe("isSafeHref", () => {
  it.each([
    ["https", "https://a.b", true],
    ["mailto", "mailto:a@b.c", true],
    ["ftp", "ftp://a.b", false],
    ["too long", `https://a.b/${"x".repeat(2_000)}`, false],
  ])("%s", (_name, href, expected) => {
    expect(isSafeHref(href)).toBe(expected);
  });
});

describe("textToDoc", () => {
  it.each([
    ["one line", "Ideia", docOf(paragraph("Ideia"))],
    [
      "lines and an empty one",
      "Primeira\r\n\nSegunda",
      docOf(paragraph("Primeira"), { type: "paragraph" }, paragraph("Segunda")),
    ],
    ["markup", "<b>x</b>", docOf(paragraph("<b>x</b>"))],
  ])("turns %s into paragraphs", (_name, body, expected) => {
    expect(textToDoc(body)).toEqual(expected);
  });

  it("round-trips the plain text of a US-018 note", () => {
    const body = "Regra\n\n\tda dependência";
    expect(plainText(textToDoc(body))).toBe(body);
    expect(parseNoteContent(textToDoc(body))).toMatchObject({
      ok: true,
      text: body,
    });
  });
});

describe("storedNoteContent", () => {
  const stored = docOf(paragraph("guardado")) as NoteDoc;

  it.each([
    ["a valid document", stored, "corpo", stored],
    ["no document (a US-018 row)", null, "corpo", docOf(paragraph("corpo"))],
    [
      "a document outside the schema",
      docOf({ type: "html" }),
      "corpo",
      docOf(paragraph("corpo")),
    ],
  ])("reads %s", (_name, content, body, expected) => {
    expect(storedNoteContent(content, body)).toEqual(expected);
  });
});
