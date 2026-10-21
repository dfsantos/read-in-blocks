import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FlatNode } from "@/domain/structure/tree";

import messages from "../../../../../../../../messages/pt-BR.json";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findBook: vi.fn(),
  listNodes: vi.fn(),
  listNotes: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/repositories/books", () => ({ findBook: mocks.findBook }));
vi.mock("@/server/repositories/book-nodes", () => ({
  listNodes: mocks.listNodes,
}));
vi.mock("@/server/repositories/notes", () => ({ listNotes: mocks.listNotes }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async (namespace: "notes") =>
      createTranslator({ locale: "pt-BR", messages, namespace }),
  };
});
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/actions/book-nodes", () => ({
  setReadingStatus: vi.fn(),
  setReadingDates: vi.fn(),
  completeAll: vi.fn(),
}));
vi.mock("@/server/actions/notes", () => ({
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

import NodePage, { generateMetadata } from "./page";

const READER = { id: "reader-1", name: "R", email: "r@x.test", image: null };
const BOOK_ID = "0b6f8f5e-5c55-4f0a-9d8e-2f1f2b7f3c11";
const PART_ID = "1c7a9e2b-8d3f-4a6b-9c5e-0f1a2b3c4d5e";
const CHAPTER_ID = "2d8b0f3c-9e4a-4b7c-8d6f-1a2b3c4d5e6f";

const node = (
  id: string,
  parentId: string | null,
  kind: FlatNode["kind"],
  title: string,
): FlatNode => ({
  id,
  parentId,
  kind,
  title,
  position: 0,
  summary: null,
  goalPages: 12,
  status: "not_started",
  startedAt: null,
  completedAt: null,
});

const props = (bookId: string, nodeId: string) => ({
  params: Promise.resolve({ bookId, nodeId }),
});

describe("NodePage", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset().mockResolvedValue(READER);
    mocks.findBook
      .mockReset()
      .mockResolvedValue({ id: BOOK_ID, title: "SICP", author: null });
    mocks.listNodes
      .mockReset()
      .mockResolvedValue([
        node(PART_ID, null, "part", "Parte I"),
        node(CHAPTER_ID, PART_ID, "chapter", "<b>Um</b>"),
      ]);
    mocks.listNotes.mockReset().mockResolvedValue([
      {
        id: "n1",
        body: "<i>nota</i>",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "<i>nota</i>",
                  marks: [{ type: "bold" }],
                },
              ],
            },
          ],
        },
        createdAt: new Date("2026-10-20T13:00:00Z"),
        updatedAt: new Date("2026-10-20T13:00:00Z"),
      },
    ]);
    mocks.notFound.mockClear();
  });
  afterEach(cleanup);

  it("requires a signed-in reader before looking anything up", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(NodePage(props(BOOK_ID, CHAPTER_ID))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.findBook).not.toHaveBeenCalled();
  });

  it("shows the node, where it sits in the book and its notebook, read with the session's id", async () => {
    render(
      <NextIntlClientProvider
        locale="pt-BR"
        messages={messages}
        timeZone="America/Sao_Paulo"
      >
        {await NodePage(props(BOOK_ID, CHAPTER_ID))}
      </NextIntlClientProvider>,
    );

    expect(mocks.findBook).toHaveBeenCalledWith(READER.id, BOOK_ID);
    expect(mocks.listNodes).toHaveBeenCalledWith(READER.id, BOOK_ID);
    expect(mocks.listNotes).toHaveBeenCalledWith(READER.id, CHAPTER_ID);
    // User content is text, never markup.
    expect(
      screen.getByRole("heading", { level: 1, name: "<b>Um</b>" }),
    ).toBeInTheDocument();
    const path = screen.getByRole("navigation", { name: "Caminho no livro" });
    expect(
      within(path).getByRole("link", { name: "Voltar para SICP" }),
    ).toHaveAttribute("href", `/books/${BOOK_ID}`);
    expect(within(path).getByRole("link", { name: "Parte I" })).toHaveAttribute(
      "href",
      `/books/${BOOK_ID}/nodes/${PART_ID}`,
    );
    expect(screen.getByText("12 páginas")).toBeInTheDocument();
    // A leaf's own reading state.
    expect(screen.getByRole("combobox")).toHaveValue("not_started");
    expect(
      screen.getByRole("list", { name: "Anotações de <b>Um</b>" }),
    ).toHaveTextContent("<i>nota</i>");
    // Rendered from the stored document (bold), with no element made from the text.
    expect(screen.getByText("<i>nota</i>").tagName).toBe("STRONG");
    expect(document.querySelector("li i")).toBeNull();
  });

  it("titles the page with the node", async () => {
    expect(await generateMetadata(props(BOOK_ID, CHAPTER_ID))).toEqual({
      title: "<b>Um</b> — Caderno — Read in Blocks",
    });
  });

  it("answers a missing or another reader's book with the 404 page", async () => {
    mocks.findBook.mockResolvedValue(undefined);

    await expect(NodePage(props(BOOK_ID, CHAPTER_ID))).rejects.toThrow("404");
    expect(mocks.listNotes).not.toHaveBeenCalled();
  });

  it("answers a node missing from the book (or of another book) with the 404 page", async () => {
    await expect(
      NodePage(props(BOOK_ID, "3e9c1a4d-0f5b-4c8d-9e7a-2b3c4d5e6f70")),
    ).rejects.toThrow("404");
    expect(mocks.listNotes).not.toHaveBeenCalled();
  });

  it.each([
    [BOOK_ID, "not-a-uuid"],
    ["not-a-uuid", CHAPTER_ID],
    [BOOK_ID, `${CHAPTER_ID}x`],
  ])(
    "answers the malformed ids %j / %j with the 404 page without a query",
    async (bookId, nodeId) => {
      await expect(NodePage(props(bookId, nodeId))).rejects.toThrow("404");
      expect(mocks.findBook).not.toHaveBeenCalled();
      expect(mocks.listNodes).not.toHaveBeenCalled();
    },
  );
});
