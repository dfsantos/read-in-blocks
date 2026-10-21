import { expect, test } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-010: the reader builds a book's structure from its page, pasting a table of contents, adds a
// topic inside a chapter, edits a node's title, summary and goal (US-011), reorders and moves chapters (US-012) and deletes a
// part with its subtree after confirming.
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

    // Reorder with the buttons, then move a chapter to another part (US-012).
    await page
      .getByRole("button", { name: "Subir 2. Arquitetura", exact: true })
      .click();
    const partOne = structure
      .getByRole("listitem")
      .filter({ hasText: "Parte I" })
      .first();
    await expect(partOne.getByRole("listitem").first()).toContainText(
      "2. Arquitetura",
    );
    await page
      .getByRole("button", { name: "Mover 2. Arquitetura", exact: true })
      .click();
    await page
      .getByLabel("Mover 2. Arquitetura para")
      .selectOption({ label: "Parte II" });
    await page.getByRole("button", { name: "Mover", exact: true }).click();
    const partTwoItem = structure
      .getByRole("listitem")
      .filter({ hasText: "Parte II" })
      .last();
    await expect(partTwoItem).toContainText("2. Arquitetura");

    // The structure survives a reload, in order, with the moved chapter in its new part.
    await page.reload();
    await expect(
      structure.getByRole("listitem").filter({ hasText: "Parte II" }).last(),
    ).toContainText("2. Arquitetura");
    await expect(
      structure
        .getByRole("listitem")
        .filter({ hasText: /^Capítulo/ })
        .first(),
    ).toContainText("Prefácio");

    // Edit in place: title, summary and goal in pages (US-011).
    await page
      .getByRole("button", { name: "Editar Parte II", exact: true })
      .click();
    const edit = page.getByRole("form", { name: "Editar Parte II" });
    await edit.getByLabel("Título").fill("Parte II — Prática");
    await edit.getByLabel("Resumo").fill("Exemplos do dia a dia.");
    await edit.getByLabel("Meta (páginas)").fill("120");
    await edit.getByRole("button", { name: "Salvar" }).click();
    await expect(edit).toBeHidden();
    const partTwo = structure
      .getByRole("listitem")
      .filter({ hasText: "Parte II — Prática" });
    await expect(partTwo).toContainText("120 páginas");
    await expect(partTwo).toContainText("Exemplos do dia a dia.");
    // Parte I has no goal: it takes the default weight.
    await expect(
      structure.getByRole("listitem").filter({ hasText: "Parte I" }).first(),
    ).toContainText("Peso padrão");

    // Deleting Parte I asks first and takes its 2 remaining nodes with it.
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
      "Os 2 itens dentro dele também serão excluídos.",
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
    await expect(structure).toContainText("2. Arquitetura");
  } finally {
    // Deleting the reader deletes their books and structure (ON DELETE CASCADE).
    await seeded.cleanUp();
  }
});
