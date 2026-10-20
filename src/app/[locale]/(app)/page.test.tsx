import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../../messages/pt-BR.json";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listBooks: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/repositories/books", () => ({ listBooks: mocks.listBooks }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    // The page only asks for library.
    getTranslations: async (namespace: "library") =>
      createTranslator({ locale: "pt-BR", messages, namespace }),
  };
});
// next-intl's navigation does not load outside Next.js; a plain anchor keeps the href.
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import LibraryPage, { generateMetadata } from "./page";

const READER = {
  id: "reader-1",
  name: "Reader",
  email: "r@x.test",
  image: null,
};

async function renderPage() {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      {await LibraryPage()}
    </NextIntlClientProvider>,
  );
}

describe("LibraryPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset().mockResolvedValue(READER);
    mocks.listBooks.mockReset();
  });
  afterEach(cleanup);

  it("requires a signed-in reader before listing anything", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(LibraryPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listBooks).not.toHaveBeenCalled();
  });

  it("lists the reader's books in the repository's order, each linking to its page", async () => {
    mocks.listBooks.mockResolvedValue([
      {
        id: "b-2",
        title: "Refactoring",
        author: "Martin Fowler",
        createdAt: new Date(),
      },
      { id: "b-1", title: "<i>SICP</i>", author: null, createdAt: new Date() },
    ]);

    await renderPage();

    expect(mocks.listBooks).toHaveBeenCalledWith(READER.id, { limit: 501 });
    expect(screen.queryByText(/Mostrando os/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Sua biblioteca" }),
    ).toBeInTheDocument();
    const items = within(
      screen.getByRole("list", { name: "Seus livros" }),
    ).getAllByRole("link");
    expect(items.map((link) => link.getAttribute("href"))).toEqual([
      "/books/b-2",
      "/books/b-1",
    ]);
    expect(items[0]).toHaveTextContent("RefactoringMartin Fowler");
    // User content is text, never markup.
    expect(items[1]).toHaveTextContent("<i>SICP</i>Autor não informado");
    expect(
      screen.getByRole("link", { name: "Cadastrar livro" }),
    ).toHaveAttribute("href", "/books/new");
  });

  it("invites the reader to create the first book when the library is empty", async () => {
    mocks.listBooks.mockResolvedValue([]);

    await renderPage();

    expect(
      screen.getByRole("heading", { level: 2, name: "Nenhum livro ainda" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Cadastrar o primeiro livro" }),
    ).toHaveAttribute("href", "/books/new");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows at most 500 books and says when there are more", async () => {
    mocks.listBooks.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({
        id: `b-${i}`,
        title: `Book ${i}`,
        author: null,
        createdAt: new Date(),
      })),
    );

    await renderPage();

    expect(
      within(screen.getByRole("list", { name: "Seus livros" })).getAllByRole(
        "link",
      ),
    ).toHaveLength(500);
    expect(screen.queryByText("Book 500")).not.toBeInTheDocument();
    expect(
      screen.getByText("Mostrando os 500 livros mais recentes."),
    ).toBeInTheDocument();
  });

  it("titles the page as the library", async () => {
    expect(await generateMetadata()).toEqual({
      title: "Biblioteca — Read in Blocks",
    });
  });
});
