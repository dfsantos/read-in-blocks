import { expect, test } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-021: the full reading loop. A signed-in reader opens the library, resumes the book at the
// chapter in progress, writes a note there and completes it; the library then points at the next
// chapter, and once the book is finished it says so and leads back to the notes, chapter by chapter.
test.afterAll(closeTestAuth);

test("a reader resumes a book from the library, takes a note and completes the chapter", async ({
  context,
  page,
}) => {
  const seeded = await seedSession(E2E_ACCOUNTS.resume);
  try {
    await context.addCookies(seeded.cookies);

    // A book with two chapters, the first one in progress.
    await page.goto("/books/new");
    await page.getByLabel("Título").fill("Refactoring");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Refactoring" }),
    ).toBeVisible();
    await page
      .getByLabel("Títulos", { exact: true })
      .fill("Princípios\nCheiros");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    const tree = page.getByRole("tree", { name: "Sumário do livro" });
    await tree.getByRole("treeitem", { name: /^Princípios / }).click();
    const details = page.getByRole("complementary", { name: "Princípios" });
    await details
      .getByLabel("Estado de Princípios")
      .selectOption("in_progress");
    await expect(details.getByLabel("Estado de Princípios")).toBeEnabled();
    await expect(details.getByText(/^Início:/)).toBeVisible();

    // The library shows where the reader stopped.
    await page.goto("/");
    const library = page.getByRole("list", { name: "Seus livros" });
    await expect(library.getByText("Em andamento: Princípios")).toBeVisible();
    await expect(
      library.getByRole("progressbar", { name: "Progresso de Refactoring" }),
    ).toHaveAttribute("aria-valuenow", "0");

    // Resume: straight to that chapter, with its notebook open.
    await library
      .getByRole("link", { name: "Retomar Refactoring em Princípios" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Princípios" }),
    ).toBeVisible();
    await page.getByLabel("Nova anotação").fill("Refatorar em passos pequenos");
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(page.getByText("1 anotação")).toBeVisible();
    await page.getByLabel("Estado de Princípios").selectOption("completed");
    await expect(page.getByText(/^Conclusão:/)).toBeVisible();

    // Back in the library: half the book, and the next chapter to start.
    await page.goto("/");
    await expect(
      library.getByRole("progressbar", { name: "Progresso de Refactoring" }),
    ).toHaveAttribute("aria-valuenow", "50");
    await expect(library.getByText("Próximo: Cheiros")).toBeVisible();
    await library
      .getByRole("link", { name: "Começar Refactoring por Cheiros" })
      .click();
    await page.getByLabel("Estado de Cheiros").selectOption("completed");
    await expect(page.getByText(/^Conclusão:/)).toBeVisible();

    // A finished book: no resume, and its notes one click away.
    await page.goto("/");
    await expect(library.getByText("Livro concluído")).toBeVisible();
    await expect(library.getByRole("link", { name: /^Retomar/ })).toHaveCount(
      0,
    );
    await library.getByText("Revisitar anotações").click();
    await library
      .getByRole("link", { name: "Princípios (1 anotação)" })
      .click();
    await expect(page.getByText("Refatorar em passos pequenos")).toBeVisible();
  } finally {
    await seeded.cleanUp();
  }
});
