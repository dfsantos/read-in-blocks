import { expect, test, type Page } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-016: the book page shows the weighted progress. With a part of 40 pages and one of 60,
// completing the first moves the book to 40% (PRD §6.2), the chapter count stays apart, and a
// chapter without goal next to a measured one is flagged.
test.afterAll(closeTestAuth);

async function addUnder(
  page: Page,
  parent: string,
  field: string,
  titles: string,
) {
  await page
    .getByRole("button", { name: `Adicionar em ${parent}`, exact: true })
    .click();
  // Earlier add forms stay open: the one just opened comes last.
  const input = page.getByLabel(field).last();
  await input.fill(titles);
  await input
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Adicionar", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "Estrutura do livro" }),
  ).toContainText(titles.split("\n").at(-1)!);
}

async function setGoal(page: Page, title: string, pages: string) {
  await page
    .getByRole("button", { name: `Editar ${title}`, exact: true })
    .click();
  const edit = page.getByRole("form", { name: `Editar ${title}` });
  await edit.getByLabel("Meta (páginas)").fill(pages);
  await edit.getByRole("button", { name: "Salvar" }).click();
  await expect(edit).toBeHidden();
}

test("a reader follows the book's weighted progress", async ({
  context,
  page,
}) => {
  const seeded = await seedSession(E2E_ACCOUNTS.progress);
  try {
    await context.addCookies(seeded.cookies);
    await page.goto("/books/new");
    await page.getByLabel("Título").fill("Refactoring");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Refactoring" }),
    ).toBeVisible();

    // No structure yet: the panel says how to start.
    const panel = page.getByRole("region", { name: "Progresso" });
    await expect(panel).toContainText(
      "Monte a estrutura do livro abaixo para acompanhar o progresso",
    );

    await page.getByLabel("Tipo").selectOption("part");
    await page.getByLabel("Títulos", { exact: true }).fill("Base\nPrática");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await addUnder(page, "Base", "Capítulos", "Um\nDois");
    await addUnder(page, "Prática", "Capítulos", "Três");
    await setGoal(page, "Base", "40");
    await setGoal(page, "Prática", "60");

    const overall = panel.getByRole("progressbar", {
      name: "Progresso do livro",
    });
    await expect(overall).toHaveAttribute("aria-valuenow", "0");
    await expect(panel).toContainText("0 de 3 capítulos concluídos");

    // "Complete all" on Base, from the table of contents.
    const tree = page.getByRole("tree", { name: "Sumário do livro" });
    // The item's own row: its center would land on a child.
    await tree
      .getByRole("treeitem", { name: /^Base / })
      .locator("> div")
      .click();
    await page
      .getByRole("complementary", { name: "Base" })
      .getByRole("button", { name: "Concluir tudo em Base" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Concluir tudo", exact: true })
      .click();

    await expect(overall).toHaveAttribute("aria-valuenow", "40");
    await expect(overall).toHaveAttribute("aria-valuetext", "40%");
    await expect(panel).toContainText("2 de 3 capítulos concluídos");
    // Two completions today are not a pace yet (US-023): it says so instead of guessing.
    const pace = panel.getByRole("region", { name: "Ritmo e previsão" });
    await expect(pace).toContainText(
      "Ainda não há dados para prever a conclusão",
    );
    await expect(pace).toContainText(
      "Até agora: 2 conclusões nas últimas 4 semanas.",
    );
    await expect(
      panel.getByRole("progressbar", { name: "Progresso de Base" }),
    ).toHaveAttribute("aria-valuenow", "100");
    await expect(
      panel.getByRole("progressbar", { name: "Progresso de Prática" }),
    ).toHaveAttribute("aria-valuenow", "0");

    // Base's chapters have no goal and weigh the same: the panel says so, discreetly.
    await expect(panel.getByRole("note")).toContainText(
      "2 itens sem meta usam o peso padrão",
    );
  } finally {
    await seeded.cleanUp();
  }
});
