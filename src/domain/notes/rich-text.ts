import { z } from "@/domain/zod";

import { visibleMultilineText } from "@/domain/text";

// The rich content of a note (US-019, RF-007, ADR-0007): the ProseMirror JSON the Tiptap editor
// produces, restricted to what the notebook offers. Shared by the editor (client) and the Server
// Actions (server): the server always parses again, and only what this module rebuilds is stored.
// Parsing rebuilds the document from the allowed nodes, marks and attributes; anything else is
// refused (an unknown node or mark, a link that is not http(s) or mailto) or dropped (an unknown
// attribute, a code language outside the list). Nothing here is ever turned into HTML: the
// read-only view renders these types as React elements.

// Headings of a note sit below the page's h1 (the node) and h2 (the notebook).
export const NOTE_HEADING_LEVELS = [3, 4] as const;
export type NoteHeadingLevel = (typeof NOTE_HEADING_LEVELS)[number];

// The languages a code block can be highlighted as (all in lowlight's `common` bundle). Display
// names are in messages/pt-BR.json, under notes.editor.languages.
export const NOTE_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "go",
  "java",
  "javascript",
  "json",
  "kotlin",
  "markdown",
  "php",
  "python",
  "ruby",
  "rust",
  "sql",
  "swift",
  "typescript",
  "xml",
  "yaml",
] as const;
export type NoteLanguage = (typeof NOTE_LANGUAGES)[number];

export const isNoteLanguage = (value: unknown): value is NoteLanguage =>
  (NOTE_LANGUAGES as readonly unknown[]).includes(value);

// A code block in this "language" is a diagram (US-022, RF-012): its text is Mermaid syntax, drawn
// in the browser instead of highlighted. It stays a code block, so the text is what is stored,
// counted and searched, and a diagram that fails to draw still shows its source.
export const DIAGRAM_LANGUAGE = "mermaid";
export type CodeBlockLanguage = NoteLanguage | typeof DIAGRAM_LANGUAGE;

export const isCodeBlockLanguage = (
  value: unknown,
): value is CodeBlockLanguage =>
  value === DIAGRAM_LANGUAGE || isNoteLanguage(value);

// The plain text of a note (what US-018 stored) keeps its limit.
export const NOTE_TEXT_MAX = 10_000;
// Bounds on the JSON itself, checked before the schema walks it: far beyond 10,000 characters of
// formatted text, and small enough for one row and one render.
export const NOTE_CONTENT_MAX_CHARS = 200_000;
// 48 JSON levels hold lists nested 10 deep (each list level is 4 JSON levels).
export const NOTE_CONTENT_MAX_DEPTH = 48;
export const NOTE_CONTENT_MAX_NODES = 10_000;
export const LINK_HREF_MAX = 2_000;

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// Whether a link may be stored and rendered: an absolute http(s) or mailto URL, with no spaces or
// control characters anywhere (they hide schemes like "java\nscript:" from naive checks).
export function isSafeHref(href: string): boolean {
  if (href.length === 0 || href.length > LINK_HREF_MAX) return false;
  if (/[\s\p{Cc}‪-‮⁦-⁩]/u.test(href)) return false;
  try {
    return LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

export type NoteMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } };

export type NoteText = { type: "text"; text: string; marks?: NoteMark[] };
export type NoteInline = NoteText | { type: "hardBreak" };
export type NoteCodeText = { type: "text"; text: string };
export type NoteListItem = { type: "listItem"; content: NoteBlock[] };

export type NoteBlock =
  | { type: "paragraph"; content?: NoteInline[] }
  | {
      type: "heading";
      attrs: { level: NoteHeadingLevel };
      content?: NoteInline[];
    }
  | {
      type: "codeBlock";
      attrs: { language: CodeBlockLanguage | null };
      content?: NoteCodeText[];
    }
  | { type: "blockquote"; content: NoteBlock[] }
  | { type: "bulletList"; content: NoteListItem[] }
  | { type: "orderedList"; attrs: { start: number }; content: NoteListItem[] };

export type NoteDoc = { type: "doc"; content: NoteBlock[] };

// Error keys under `notes.errors` in messages/pt-BR.json (rule i18n).
export const noteContentErrors = {
  bodyRequired: "bodyRequired",
  bodyTooLong: "bodyTooLong",
  invalidCharacters: "invalidCharacters",
  invalidContent: "invalidContent",
  invalidLink: "invalidLink",
  contentTooLarge: "contentTooLarge",
} as const;

export type NoteContentError =
  (typeof noteContentErrors)[keyof typeof noteContentErrors];

// A text node is never empty in ProseMirror.
const textValue = z.string().min(1).max(NOTE_TEXT_MAX);

const linkMark = z.object({
  type: z.literal("link"),
  attrs: z.object({
    href: z
      .string()
      .refine(isSafeHref, { error: noteContentErrors.invalidLink }),
  }),
});

// Unknown keys (target, rel, class, title, on*) are dropped: the view sets its own.
const mark: z.ZodType<NoteMark> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  z.object({ type: z.literal("code") }),
  linkMark,
]);

const text: z.ZodType<NoteText> = z.object({
  type: z.literal("text"),
  text: textValue,
  marks: z.array(mark).max(4).optional(),
});

const inline: z.ZodType<NoteInline> = z.union([
  text,
  z.object({ type: z.literal("hardBreak") }),
]);

const inlineContent = z.array(inline).max(NOTE_CONTENT_MAX_NODES).optional();

// Pasted code may carry any language class: one outside the list is kept as plain code.
const language = z
  .unknown()
  .transform((value) => (isCodeBlockLanguage(value) ? value : null));

const listItem: z.ZodType<NoteListItem> = z.object({
  type: z.literal("listItem"),
  get content() {
    return z.array(block).min(1).max(NOTE_CONTENT_MAX_NODES);
  },
});

const listItems = z.array(listItem).min(1).max(NOTE_CONTENT_MAX_NODES);

const block: z.ZodType<NoteBlock> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), content: inlineContent }),
  z.object({
    type: z.literal("heading"),
    attrs: z.object({
      level: z.literal(NOTE_HEADING_LEVELS),
    }),
    content: inlineContent,
  }),
  z.object({
    type: z.literal("codeBlock"),
    attrs: z
      .object({ language })
      .optional()
      .transform((attrs) => ({ language: attrs?.language ?? null })),
    content: z
      .array(z.object({ type: z.literal("text"), text: textValue }))
      .max(NOTE_CONTENT_MAX_NODES)
      .optional(),
  }),
  z.object({
    type: z.literal("blockquote"),
    get content() {
      return z.array(block).min(1).max(NOTE_CONTENT_MAX_NODES);
    },
  }),
  z.object({ type: z.literal("bulletList"), content: listItems }),
  z.object({
    type: z.literal("orderedList"),
    attrs: z
      .object({ start: z.number().int().min(0).max(1_000_000) })
      .optional()
      .transform((attrs) => ({ start: attrs?.start ?? 1 })),
    content: listItems,
  }),
]);

const doc: z.ZodType<NoteDoc> = z.object({
  type: z.literal("doc"),
  content: z.array(block).min(1).max(NOTE_CONTENT_MAX_NODES),
});

// Depth, node count and total string length of any JSON value, walked without recursion, so a
// hostile payload cannot exhaust the stack or memory before the limits apply (a string referenced
// by thousands of objects counts each time). Stops as soon as a limit is passed.
function withinShapeLimits(value: unknown): boolean {
  const stack: Array<[unknown, number]> = [[value, 1]];
  let nodes = 0;
  let chars = 0;
  while (stack.length > 0) {
    const [current, depth] = stack.pop()!;
    if (typeof current === "string") {
      chars += current.length;
      if (chars > NOTE_CONTENT_MAX_CHARS) return false;
      continue;
    }
    if (current === null || typeof current !== "object") continue;
    nodes += 1;
    if (depth > NOTE_CONTENT_MAX_DEPTH || nodes > NOTE_CONTENT_MAX_NODES) {
      return false;
    }
    for (const [key, child] of Object.entries(current)) {
      chars += key.length;
      stack.push([child, depth + 1]);
    }
  }
  return chars <= NOTE_CONTENT_MAX_CHARS;
}

function inlineText(content: readonly NoteInline[] | undefined): string {
  return (content ?? [])
    .map((node) => (node.type === "text" ? node.text : "\n"))
    .join("");
}

function blockText(node: NoteBlock | NoteListItem): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return inlineText(node.content);
    case "codeBlock":
      return (node.content ?? []).map((part) => part.text).join("");
    default:
      return node.content.map(blockText).join("\n");
  }
}

// The plain text of a note, one line per block: what the `body` column keeps (US-018's limit and
// check still apply to it) and what a reader with no formatting would read.
export function plainText(content: NoteDoc): string {
  return content.content.map(blockText).join("\n");
}

// A US-018 plain-text note as a document: one paragraph per line, empty lines kept. The same shape
// migration 0012 wrote for the notes it converted.
export function textToDoc(body: string): NoteDoc {
  return {
    type: "doc",
    content: body
      .replaceAll("\r", "")
      .split("\n")
      .map((line) =>
        line === ""
          ? { type: "paragraph" }
          : { type: "paragraph", content: [{ type: "text", text: line }] },
      ),
  };
}

export type ParsedNoteContent =
  | { ok: true; content: NoteDoc; text: string }
  | { ok: false; error: NoteContentError };

// Validates what a client sent as a note's content and rebuilds it from the allowed schema. The
// text must have something visible, stay within US-018's limit and carry no hidden characters.
export function parseNoteContent(value: unknown): ParsedNoteContent {
  if (value === undefined || value === null) {
    return { ok: false, error: noteContentErrors.bodyRequired };
  }
  if (!withinShapeLimits(value)) {
    return { ok: false, error: noteContentErrors.contentTooLarge };
  }
  let size: number;
  try {
    size = JSON.stringify(value)?.length ?? 0;
  } catch {
    return { ok: false, error: noteContentErrors.invalidContent };
  }
  if (size > NOTE_CONTENT_MAX_CHARS) {
    return { ok: false, error: noteContentErrors.contentTooLarge };
  }

  const parsed = doc.safeParse(value);
  if (!parsed.success) {
    const invalidLink = parsed.error.issues.some(
      (issue) => issue.message === noteContentErrors.invalidLink,
    );
    return {
      ok: false,
      error: invalidLink
        ? noteContentErrors.invalidLink
        : noteContentErrors.invalidContent,
    };
  }

  const text = plainText(parsed.data);
  if (text.trim().length === 0) {
    return { ok: false, error: noteContentErrors.bodyRequired };
  }
  if (text.length > NOTE_TEXT_MAX) {
    return { ok: false, error: noteContentErrors.bodyTooLong };
  }
  if (!visibleMultilineText(text)) {
    return { ok: false, error: noteContentErrors.invalidCharacters };
  }
  return { ok: true, content: parsed.data, text };
}

// The document of a stored note (read path). Rows are parsed again before rendering; the plain text
// wins whenever the document does not match the schema or no longer says the same thing: the
// application always writes both together, so a mismatch means `body` was changed alone (US-018
// code still running during a deploy) and its text is the newer one.
export function storedNoteContent(content: unknown, body: string): NoteDoc {
  if (content === null || content === undefined) return textToDoc(body);
  if (!withinShapeLimits(content)) return textToDoc(body);
  const parsed = doc.safeParse(content);
  if (!parsed.success) return textToDoc(body);
  return plainText(parsed.data) === body.replaceAll("\r", "")
    ? parsed.data
    : textToDoc(body);
}

// A plain-text note ready to store (tests and seeds): its document, its text and the default kind.
export const plainNote = (body: string) => ({
  content: textToDoc(body),
  text: body,
  type: "key_concept" as const,
  reference: null,
});
