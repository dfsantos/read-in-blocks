import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import { plainNote, textToDoc } from "@/domain/notes/rich-text";
import { addNodes } from "@/server/repositories/book-nodes";
import { createBook } from "@/server/repositories/books";
import { createNote as seedNote, listNotes } from "@/server/repositories/notes";

import { requireTestEnv } from "./db-env";
import { useReaders } from "./isolation/two-readers";

// The notebook Server Actions called directly, as an attacker posting to them would (US-018): no
// page, no form, any payload. The session is mocked; everything below it (quota, repository, RLS)
// is the real code against Postgres with the app role.

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/db/client", () => ({ getDb: () => db }));

import {
  createNote,
  deleteNote,
  setNoteResolved,
  updateNote,
} from "@/server/actions/notes";

afterAll(() => pool.end());

function signIn(reader: { id: string; email: string }) {
  mocks.requireUser.mockResolvedValue({
    id: reader.id,
    name: "reader",
    email: reader.email,
    image: null,
  });
}

async function chapterWithNote(ownerId: string) {
  const book = await createBook(ownerId, { title: "Book", author: null }, db);
  const added = await addNodes(
    ownerId,
    { bookId: book.id, parentId: null, kind: "chapter", titles: ["Chapter"] },
    db,
  );
  if (!added.ok) throw new Error(`seed failed: ${added.reason}`);
  const note = await seedNote(
    ownerId,
    added.ids[0],
    plainNote("Owned note"),
    db,
  );
  if (!note.ok) throw new Error(`seed failed: ${note.reason}`);
  return { nodeId: added.ids[0], noteId: note.id };
}

// What the editor sends for a plain-text note.
const typed = (body: string) => ({
  content: textToDoc(body),
  type: "key_concept",
});
const doc = (...content: unknown[]) => ({
  content: { type: "doc", content },
  type: "key_concept",
});
const paragraph = (text: string, marks?: unknown[]) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

const MALFORMED_IDS = [
  ["not a uuid", "not-a-uuid"],
  ["an injection", "1' or '1'='1"],
  ["a number", 42],
  ["an object", { id: randomUUID() }],
  ["nothing", undefined],
] as const;

describe("notebook Server Actions", () => {
  const { create } = useReaders(db, "note-actions.test");

  beforeEach(() => {
    mocks.requireUser.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("are refused without a session and touch nothing", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    const transaction = vi.spyOn(db, "transaction");

    for (const call of [
      () => createNote(randomUUID(), typed("A")),
      () => updateNote(randomUUID(), typed("A")),
      () => setNoteResolved(randomUUID(), true),
      () => deleteNote(randomUUID()),
    ]) {
      await expect(call()).rejects.toThrow("NEXT_REDIRECT /login");
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates, edits and deletes the reader's notes", async () => {
    const { owner } = await create();
    const { nodeId, noteId } = await chapterWithNote(owner.id);
    signIn(owner);

    const created = await createNote(nodeId, typed("Segunda\nlinha"));
    expect(created).toEqual({ ok: true, id: expect.any(String) });
    expect(await updateNote(noteId, typed("Primeira, revista"))).toEqual({
      ok: true,
    });
    expect(
      (await listNotes(owner.id, nodeId, db)).map((note) => note.body),
    ).toEqual(["Primeira, revista", "Segunda\nlinha"]);
    expect((await listNotes(owner.id, nodeId, db))[1].content).toEqual(
      textToDoc("Segunda\nlinha"),
    );

    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await deleteNote(noteId)).toEqual({ ok: true });
    expect(
      (await listNotes(owner.id, nodeId, db)).map((note) => note.body),
    ).toEqual(["Segunda\nlinha"]);
    // A security event with ids only, never the note's text.
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
      event: "notes.deleted",
      userId: owner.id,
      noteId,
      at: expect.any(String),
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("Primeira");
  });

  it("resolves the reader's actions and questions, and nothing else", async () => {
    const { owner, intruder } = await create();
    const { nodeId, noteId } = await chapterWithNote(owner.id);
    signIn(owner);
    const created = await createNote(nodeId, {
      ...typed("Testar isso"),
      type: "action_or_question",
    });
    if (!created.ok) throw new Error("unexpected refusal");

    const notFound = { ok: false, errorKey: "notFound" };
    expect(await setNoteResolved(created.id, true)).toEqual({ ok: true });
    // A key concept is not resolvable: answered like a missing note.
    expect(await setNoteResolved(noteId, true)).toEqual(notFound);
    expect(await setNoteResolved(created.id, "yes")).toEqual(notFound);
    expect(await setNoteResolved("not-a-uuid", true)).toEqual(notFound);
    expect(
      (await listNotes(owner.id, nodeId, db)).map(
        (note) => note.resolvedAt !== null,
      ),
    ).toEqual([false, true]);

    signIn(intruder);
    expect(await setNoteResolved(created.id, false)).toEqual(notFound);
    expect(
      (await listNotes(owner.id, nodeId, db))[1].resolvedAt,
    ).not.toBeNull();
  });

  it("answers another reader's node or note like a missing one, and changes nothing", async () => {
    const { owner, intruder } = await create();
    const { nodeId, noteId } = await chapterWithNote(owner.id);
    signIn(intruder);

    const notFound = { ok: false, errorKey: "notFound" };
    expect(await createNote(nodeId, typed("Intruder"))).toEqual(notFound);
    expect(await createNote(randomUUID(), typed("Intruder"))).toEqual(notFound);
    expect(await updateNote(noteId, typed("Taken"))).toEqual(notFound);
    expect(await updateNote(randomUUID(), typed("Taken"))).toEqual(notFound);
    expect(await deleteNote(noteId)).toEqual(notFound);
    expect(await deleteNote(randomUUID())).toEqual(notFound);

    expect(
      (await listNotes(owner.id, nodeId, db)).map((note) => note.body),
    ).toEqual(["Owned note"]);
  });

  it.each(MALFORMED_IDS)(
    "answers %s as an id like a missing resource",
    async (_name, id) => {
      const { owner } = await create();
      signIn(owner);

      const notFound = { ok: false, errorKey: "notFound" };
      expect(await createNote(id, typed("A"))).toEqual(notFound);
      expect(await updateNote(id, typed("A"))).toEqual(notFound);
      expect(await deleteNote(id)).toEqual(notFound);
    },
  );

  it.each([
    ["an empty note", doc({ type: "paragraph" }), "bodyRequired"],
    ["no content", { type: "key_concept" }, "bodyRequired"],
    ["not an object", "text", "bodyRequired"],
    ["a US-018 body", { type: "key_concept", body: "Plain" }, "bodyRequired"],
    [
      "HTML instead of a document",
      { type: "key_concept", content: "<p>a</p>" },
      "invalidContent",
    ],
    ["no kind", { content: textToDoc("a") }, "invalidType"],
    ["an unknown kind", { ...typed("a"), type: "summary" }, "invalidType"],
    [
      "a quote without reference",
      { ...typed("a"), type: "quote" },
      "referenceRequired",
    ],
    [
      "a quote with a blank reference",
      { ...typed("a"), type: "quote", reference: "  " },
      "referenceRequired",
    ],
    [
      "a reference over the limit",
      { ...typed("a"), type: "quote", reference: "p".repeat(51) },
      "referenceTooLong",
    ],
    [
      "a reference with a line break",
      { ...typed("a"), type: "quote", reference: "p. 1\np. 2" },
      "referenceInvalid",
    ],
    [
      "a script node",
      doc({ type: "script", text: "alert(1)" }),
      "invalidContent",
    ],
    [
      "an image with onerror",
      doc({ type: "image", attrs: { src: "x", onerror: "alert(1)" } }),
      "invalidContent",
    ],
    [
      "a javascript: link",
      doc(
        paragraph("a", [
          { type: "link", attrs: { href: "javascript:alert(1)" } },
        ]),
      ),
      "invalidLink",
    ],
    [
      "a data: link",
      doc(
        paragraph("a", [
          {
            type: "link",
            attrs: { href: "data:text/html,<script>alert(1)</script>" },
          },
        ]),
      ),
      "invalidLink",
    ],
    [
      "a structure the editor cannot open",
      doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "codeBlock", content: [{ type: "text", text: "x" }] },
            ],
          },
        ],
      }),
      "invalidContent",
    ],
    [
      "a text over the limit",
      doc(paragraph("a".repeat(10_000)), paragraph("b")),
      "bodyTooLong",
    ],
    [
      "a document too deep",
      {
        type: "key_concept",
        content: {
          type: "doc",
          content: [
            Array.from({ length: 200 }).reduce<unknown>(
              (inner) => ({ type: "blockquote", content: [inner] }),
              paragraph("deep"),
            ),
          ],
        },
      },
      "contentTooLarge",
    ],
    ["a control character", doc(paragraph("a\u0000b")), "invalidCharacters"],
    [
      "a bidirectional override",
      doc(paragraph("a\u202Eb")),
      "invalidCharacters",
    ],
  ])("refuses %s before touching the database", async (_name, input, key) => {
    const { owner } = await create();
    const { nodeId, noteId } = await chapterWithNote(owner.id);
    signIn(owner);
    const transaction = vi.spyOn(db, "transaction");

    const refused = { ok: false, errorKey: key, field: "body" };
    expect(await createNote(nodeId, input)).toEqual(refused);
    expect(await updateNote(noteId, input)).toEqual(refused);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("stores the rebuilt document, never what the client sent", async () => {
    const { owner } = await create();
    const { nodeId, noteId } = await chapterWithNote(owner.id);
    signIn(owner);

    const sent = {
      type: "quote",
      reference: "  p. 42 ",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { onclick: "alert(1)" },
            content: [
              {
                type: "text",
                text: "site",
                style: "x",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: "https://example.com",
                      target: "_self",
                      onmouseover: "x",
                    },
                  },
                ],
              },
            ],
          },
          {
            type: "codeBlock",
            attrs: { language: "<script>" },
            content: [{ type: "text", text: "print(1)" }],
          },
        ],
      },
    };
    expect(await updateNote(noteId, sent)).toEqual({ ok: true });

    const [stored] = await listNotes(owner.id, nodeId, db);
    expect(stored.content).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "site",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: null },
          content: [{ type: "text", text: "print(1)" }],
        },
      ],
    });
    expect(stored.body).toBe("site\nprint(1)");
    expect(stored).toMatchObject({ type: "quote", reference: "p. 42" });
  });

  it.each([
    ["additions", 30, (nodeId: string) => createNote(nodeId, typed("N"))],
    [
      "updates",
      60,
      (_nodeId: string, noteId: string) => updateNote(noteId, typed("U")),
    ],
    ["deletions", 30, () => deleteNote(randomUUID())],
    ["resolutions", 60, () => setNoteResolved(randomUUID(), true)],
  ] as const)(
    "stops a reader past the quota of %s a minute",
    async (_name, limit, call) => {
      const { owner } = await create();
      const { nodeId, noteId } = await chapterWithNote(owner.id);
      signIn(owner);

      for (let i = 0; i < limit; i += 1) {
        expect(await call(nodeId, noteId)).not.toEqual({
          ok: false,
          errorKey: "rateLimited",
        });
      }
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      expect(await call(nodeId, noteId)).toEqual({
        ok: false,
        errorKey: "rateLimited",
      });
      // A blocked deletion is a security event too (ids only).
      const events = info.mock.calls.map(
        (args) => JSON.parse(args[0] as string).event,
      );
      expect(events.includes("notes.delete_rate_limited")).toBe(
        _name === "deletions",
      );
    },
  );

  it("answers a database failure with a generic key and logs no content", async () => {
    const { owner } = await create();
    signIn(owner);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "transaction").mockRejectedValue(
      Object.assign(new Error('insert "Secret Note" failed'), {
        code: "XX000",
      }),
    );

    const failed = { ok: false, errorKey: "failed" };
    expect(await createNote(randomUUID(), typed("Secret Note"))).toEqual(
      failed,
    );
    expect(await updateNote(randomUUID(), typed("Secret Note"))).toEqual(
      failed,
    );
    expect(await deleteNote(randomUUID())).toEqual(failed);
    expect(error.mock.calls.map((call) => call[0])).toEqual([
      "notes.create failed",
      "notes.update failed",
      "notes.delete failed",
    ]);
    expect(JSON.stringify(error.mock.calls)).not.toContain("Secret");
  });
});
