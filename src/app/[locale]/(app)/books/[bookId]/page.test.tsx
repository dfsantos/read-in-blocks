import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../../../../messages/pt-BR.json";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findBook: vi.fn(),
  deleteBook: vi.fn(),
  listNodes: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/repositories/books", () => ({ findBook: mocks.findBook }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    // The page only asks for books.detail.
    getTranslations: async (namespace: "books.detail") =>
      createTranslator({ locale: "pt-BR", messages, namespace }),
  };
});
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/server/actions/books", () => ({ deleteBook: mocks.deleteBook }));
vi.mock("@/server/repositories/book-nodes", () => ({
  listNodes: mocks.listNodes,
}));
vi.mock("@/server/actions/book-nodes", () => ({
  addNodes: vi.fn(),
  updateNode: vi.fn(),
  moveNode: vi.fn(),
  deleteNode: vi.fn(),
}));

import BookPage, { generateMetadata } from "./page";

const READER = {
  id: "reader-1",
  name: "Reader",
  email: "r@x.test",
  image: null,
};
const BOOK_ID = "0b6f8f5e-5c55-4f0a-9d8e-2f1f2b7f3c11";

const props = (bookId: string) => ({ params: Promise.resolve({ bookId }) });

describe("BookPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset().mockResolvedValue(READER);
    mocks.findBook.mockReset();
    mocks.listNodes.mockReset().mockResolvedValue([]);
    mocks.notFound.mockClear();
  });
  afterEach(cleanup);

  it("requires a signed-in reader before looking up the book", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(BookPage(props(BOOK_ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.findBook).not.toHaveBeenCalled();
  });

  it("renders the reader's book, looked up with the session's id", async () => {
    mocks.findBook.mockResolvedValue({
      id: BOOK_ID,
      title: "<b>Refactoring</b>",
      author: "Martin Fowler",
      createdAt: new Date(),
    });

    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        {await BookPage(props(BOOK_ID))}
      </NextIntlClientProvider>,
    );

    expect(mocks.findBook).toHaveBeenCalledWith(READER.id, BOOK_ID);
    // User content is text, never markup.
    expect(
      screen.getByRole("heading", { level: 1, name: "<b>Refactoring</b>" }),
    ).toBeInTheDocument();
    expect(screen.getByText("de Martin Fowler")).toBeInTheDocument();
  });

  it("offers editing and deleting the book", async () => {
    mocks.findBook.mockResolvedValue({
      id: BOOK_ID,
      title: "SICP",
      author: null,
      createdAt: new Date(),
    });

    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        {await BookPage(props(BOOK_ID))}
      </NextIntlClientProvider>,
    );

    const actions = screen.getByRole("group", { name: "Ações do livro" });
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      `/books/${BOOK_ID}/edit`,
    );
    expect(actions).toContainElement(
      screen.getByRole("button", { name: "Excluir livro" }),
    );
  });

  it("shows the book's structure, read with the session's id", async () => {
    mocks.findBook.mockResolvedValue({
      id: BOOK_ID,
      title: "SICP",
      author: null,
      createdAt: new Date(),
    });
    mocks.listNodes.mockResolvedValue([
      {
        id: "c1",
        parentId: "p1",
        kind: "chapter",
        title: "<i>One</i>",
        position: 0,
      },
      { id: "p1", parentId: null, kind: "part", title: "Part I", position: 0 },
    ]);

    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        {await BookPage(props(BOOK_ID))}
      </NextIntlClientProvider>,
    );

    expect(mocks.listNodes).toHaveBeenCalledWith(READER.id, BOOK_ID);
    const structure = screen.getByRole("list", { name: "Estrutura do livro" });
    expect(structure).toHaveTextContent("Part I");
    // User content is text, never markup.
    expect(screen.getByText("<i>One</i>")).toBeInTheDocument();
  });

  it("says when the author is unknown", async () => {
    mocks.findBook.mockResolvedValue({
      id: BOOK_ID,
      title: "SICP",
      author: null,
      createdAt: new Date(),
    });

    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        {await BookPage(props(BOOK_ID))}
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Autor não informado")).toBeInTheDocument();
  });

  it("answers a missing or another reader's book with the 404 page", async () => {
    mocks.findBook.mockResolvedValue(undefined);

    await expect(BookPage(props(BOOK_ID))).rejects.toThrow("404");
    await expect(generateMetadata(props(BOOK_ID))).rejects.toThrow("404");
  });

  it.each(["not-a-uuid", "1' or '1'='1", "", `${BOOK_ID}x`])(
    "answers the malformed id %j with the 404 page without a query",
    async (bookId) => {
      await expect(BookPage(props(bookId))).rejects.toThrow("404");
      expect(mocks.findBook).not.toHaveBeenCalled();
    },
  );

  it("titles the page with the book's title", async () => {
    mocks.findBook.mockResolvedValue({
      id: BOOK_ID,
      title: "SICP",
      author: null,
      createdAt: new Date(),
    });

    expect(await generateMetadata(props(BOOK_ID))).toEqual({
      title: "SICP — Read in Blocks",
    });
  });
});
