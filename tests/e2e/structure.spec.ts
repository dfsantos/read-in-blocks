import { expect, test } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-010: the reader builds a book's structure from its page, pasting a table of contents, adds a
// topic inside a chapter, renames a node and deletes a part with its subtree after confirming.
test.afterAll(closeTestAuth);

test("a reader builds, renames and prunes a book's structure", async ({
  context,
  page,
}) => {
  const seeded = await seedSession(E2E_ACCOUNTS.structure);
  try {
    await context.addCookies(seeded.cookies);
    await page.goto("/books/new");
    await page.getByLabel("Título").fill("Clean Architecture");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Clean Architecture" }),
    ).toBeVisible();
    await expect(
      page.getByText("Nenhuma parte ou capítulo ainda."),
    ).toBeVisible();

    // A chapter straight in the book (D-06), then two parts in one paste.
    await page.getByLabel("Tipo").selectOption("chapter");
    await page.getByLabel("Títulos", { exact: true }).fill("Prefácio");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("1 item adicionado.");
    await page.getByLabel("Tipo").selectOption("part");
    await page
      .getByLabel("Títulos", { exact: true })
      .fill("Parte I\n\nParte II\n");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("2 itens adicionados.");

    const structure = page.getByRole("list", { name: "Estrutura do livro" });
    await expect(structure).toContainText("Prefácio");
    await expect(structure).toContainText("Parte II");

    // Chapters pasted inside Parte I, then a topic inside the first chapter.
    await page
      .getByRole("button", {
        name: "Adicionar em Parte I",
        exact: true,
      })
      .click();
    await page.getByLabel("Capítulos").fill("1. Design\n2. Arquitetura");
    await page
      .getByLabel("Capítulos")
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
    await expect(structure).toContainText("2. Arquitetura");
    await page
      .getByRole("button", {
        name: "Adicionar em 1. Design",
        exact: true,
      })
      .click();
    await page.getByLabel("Tópicos").fill("O que é design?");
    await page
      .getByLabel("Tópicos")
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
    await expect(structure).toContainText("O que é design?");

    // The structure survives a reload, in order.
    await page.reload();
    await expect(
      structure
        .getByRole("listitem")
        .filter({ hasText: /^Capítulo/ })
        .first(),
    ).toContainText("Prefácio");

    // Rename in place.
    await page
      .getByRole("button", {
        name: "Renomear Parte II",
        exact: true,
      })
      .click();
    await page.getByLabel("Novo título de Parte II").fill("Parte II — Prática");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(structure).toContainText("Parte II — Prática");

    // Deleting Parte I asks first and takes its 3 nodes with it.
    await page
      .getByRole("button", {
        name: "Excluir Parte I",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("alertdialog", {
      name: "Excluir “Parte I”?",
    });
    await expect(dialog).toContainText(
      "Os 3 itens dentro dele também serão excluídos.",
    );
    await dialog.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Excluir Parte I", exact: true }),
    ).toHaveCount(0);
    await expect(structure).not.toContainText("1. Design");
    await expect(structure).not.toContainText("O que é design?");
    await expect(structure).toContainText("Prefácio");
    await expect(structure).toContainText("Parte II — Prática");
  } finally {
    // Deleting the reader deletes their books and structure (ON DELETE CASCADE).
    await seeded.cleanUp();
  }
});
