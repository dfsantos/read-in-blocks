import { expect, test } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-018: the reader opens a chapter's notebook from the table of contents, writes, edits and
// deletes plain-text notes, sees the count in the table of contents, and another reader gets the
// 404 page for that notebook. Deleting the book takes the notes with it (D-09).
test.afterAll(closeTestAuth);
test.describe.configure({ mode: "serial" });

test("a reader keeps notes in a chapter's notebook", async ({
  browser,
  context,
  page,
}) => {
  const seeded = await seedSession(E2E_ACCOUNTS.notes);
  const intruder = await seedSession(E2E_ACCOUNTS.notesIntruder);
  try {
    await context.addCookies(seeded.cookies);
    await page.goto("/books/new");
    await page.getByLabel("Título").fill("Clean Architecture");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Clean Architecture" }),
    ).toBeVisible();
    await page
      .getByLabel("Títulos", { exact: true })
      .fill("Prefácio\nFronteiras");

    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    const tree = page.getByRole("tree", { name: "Sumário do livro" });
    const item = (name: string) =>
      tree.getByRole("treeitem", { name: new RegExp(`^${name} `) });
    await expect(item("Fronteiras")).toHaveAccessibleName(
      "Fronteiras Não iniciado",
    );

    // From the table of contents to the chapter's notebook.
    await item("Fronteiras").click();
    const details = page.getByRole("complementary", { name: "Fronteiras" });
    await expect(details.getByText("sem anotações")).toBeVisible();
    await details.getByRole("link", { name: "Abrir caderno" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Fronteiras" }),
    ).toBeVisible();
    const notebookUrl = page.url();

    // Write two notes; markup stays text.
    const field = page.getByLabel("Nova anotação");
    await field.fill("Regra da dependência\naponta para dentro");
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(page.getByText("1 anotação")).toBeVisible();
    await field.fill("<b>Plugins</b>");
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    const list = page.getByRole("list", { name: "Anotações de Fronteiras" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").nth(0)).toContainText(
      "Regra da dependência",
    );
    await expect(list.getByRole("listitem").nth(1)).toContainText(
      "<b>Plugins</b>",
    );

    // Edit the first one: it shows when it was edited.
    await list
      .getByRole("listitem")
      .nth(0)
      .getByRole("button", { name: /^Editar a anotação de / })
      .click();
    await page.getByLabel("Texto da anotação").fill("Dependências para dentro");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(list.getByRole("listitem").nth(0)).toContainText(
      "Dependências para dentro",
    );
    await expect(list.getByRole("listitem").nth(0)).toContainText("editada em");

    // Delete the second one, after confirming.
    await list
      .getByRole("listitem")
      .nth(1)
      .getByRole("button", { name: /^Excluir a anotação de / })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir anotação" })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(1);

    // Back in the table of contents, the chapter shows its count.
    await page
      .getByRole("link", { name: "Voltar para Clean Architecture" })
      .click();
    await expect(item("Fronteiras")).toHaveAccessibleName(
      "Fronteiras Não iniciado · 1 anotação",
    );

    // Another reader gets the 404 page for that notebook.
    const other = await browser.newContext();
    try {
      await other.addCookies(intruder.cookies);
      const otherPage = await other.newPage();
      const response = await otherPage.goto(notebookUrl);
      expect(response?.status()).toBe(404);
      await expect(otherPage.getByText("Dependências")).toHaveCount(0);
    } finally {
      await other.close();
    }
  } finally {
    await seeded.cleanUp();
    await intruder.cleanUp();
  }
});
