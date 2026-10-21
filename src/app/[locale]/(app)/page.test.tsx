import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../../messages/pt-BR.json";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listBooks: vi.fn(),
  listLibraryNodes: vi.fn(),
  countLibraryNotes: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/repositories/books", () => ({ listBooks: mocks.listBooks }));
vi.mock("@/server/repositories/book-nodes", () => ({
  listLibraryNodes: mocks.listLibraryNodes,
}));
vi.mock("@/server/repositories/notes", () => ({
  countLibraryNotes: mocks.countLibraryNotes,
}));
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

import type { FlatNode } from "@/domain/structure/tree";

import LibraryPage, { generateMetadata } from "./page";

const node = (
  id: string,
  parentId: string | null,
  kind: FlatNode["kind"],
  title: string,
  position: number,
  details: Partial<FlatNode> = {},
): FlatNode => ({
  id,
  parentId,
  kind,
  title,
  position,
  summary: null,
  goalPages: null,
  status: "not_started",
  startedAt: null,
  completedAt: null,
  ...details,
});
const done = {
  status: "completed",
  startedAt: "2026-10-01",
  completedAt: "2026-10-02",
} as const;

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
    mocks.listLibraryNodes.mockReset().mockResolvedValue(new Map());
    mocks.countLibraryNotes.mockReset().mockResolvedValue({});
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

  it("shows each book's progress and resumes it at the first node in progress", async () => {
    mocks.listBooks.mockResolvedValue([
      { id: "b-1", title: "DDD", author: null, createdAt: new Date() },
    ]);
    mocks.listLibraryNodes.mockResolvedValue(
      new Map([
        [
          "b-1",
          [
            node("c1", null, "chapter", "Um", 0, { ...done, goalPages: 30 }),
            node("c2", null, "chapter", "Dois", 1, { goalPages: 30 }),
            node("c3", null, "chapter", "<b>Três</b>", 2, {
              status: "in_progress",
              startedAt: "2026-10-03",
              goalPages: 40,
            }),
          ],
        ],
      ]),
    );

    await renderPage();

    expect(mocks.listLibraryNodes).toHaveBeenCalledWith(READER.id);
    expect(
      screen.getByRole("progressbar", { name: "Progresso de DDD" }),
    ).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByText("30% lido")).toBeInTheDocument();
    // User content is text, never markup.
    expect(screen.getByText("Em andamento: <b>Três</b>")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Retomar DDD em <b>Três</b>" }),
    ).toHaveAttribute("href", "/books/b-1/nodes/c3");
  });

  it("starts a book at its first node not started", async () => {
    mocks.listBooks.mockResolvedValue([
      { id: "b-1", title: "DDD", author: null, createdAt: new Date() },
    ]);
    mocks.listLibraryNodes.mockResolvedValue(
      new Map([
        [
          "b-1",
          [
            node("p1", null, "part", "Parte I", 0),
            node("c1", "p1", "chapter", "Um", 0, done),
            node("c2", "p1", "chapter", "Dois", 1),
          ],
        ],
      ]),
    );

    await renderPage();

    expect(screen.getByText("Próximo: Dois")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Começar DDD por Dois" }),
    ).toHaveAttribute("href", "/books/b-1/nodes/c2");
  });

  it("marks a finished book and offers its notes chapter by chapter", async () => {
    mocks.listBooks.mockResolvedValue([
      { id: "b-1", title: "DDD", author: null, createdAt: new Date() },
    ]);
    mocks.listLibraryNodes.mockResolvedValue(
      new Map([
        [
          "b-1",
          [
            node("p1", null, "part", "Parte I", 0),
            node("c1", "p1", "chapter", "Um", 0, done),
            node("c2", "p1", "chapter", "Dois", 1, done),
          ],
        ],
      ]),
    );
    mocks.countLibraryNotes.mockResolvedValue({ c2: 3, p1: 1, other: 9 });

    await renderPage();

    expect(screen.getByText("Livro concluído")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Retomar/ })).toBeNull();
    const notes = within(
      screen.getByRole("list", { name: "Anotações de DDD por capítulo" }),
    ).getAllByRole("link");
    expect(
      notes.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Parte I (1 anotação)", "/books/b-1/nodes/p1"],
      ["Dois (3 anotações)", "/books/b-1/nodes/c2"],
    ]);
  });

  it("says when a finished book has no notes", async () => {
    mocks.listBooks.mockResolvedValue([
      { id: "b-1", title: "DDD", author: null, createdAt: new Date() },
    ]);
    mocks.listLibraryNodes.mockResolvedValue(
      new Map([["b-1", [node("c1", null, "chapter", "Um", 0, done)]]]),
    );

    await renderPage();

    expect(
      screen.getByText("Nenhuma anotação neste livro."),
    ).toBeInTheDocument();
  });

  it("guides the reader when a book has no structure", async () => {
    mocks.listBooks.mockResolvedValue([
      { id: "b-1", title: "DDD", author: null, createdAt: new Date() },
    ]);

    await renderPage();

    expect(
      screen.getByText(/Sem estrutura ainda: abra o livro/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /^Retomar|^Começar/ }),
    ).toBeNull();
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
