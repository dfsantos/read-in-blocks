import { expect, test } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-017: the reader switches the book's contents to the blocks view, finds it still chosen after a
// reload, opens a chapter's notebook from its card, and the cards fit a phone-sized screen.
test.afterAll(closeTestAuth);

test("a reader sees the book as blocks grouped by part", async ({
  context,
  page,
}) => {
  const seeded = await seedSession(E2E_ACCOUNTS.blocks);
  try {
    await context.addCookies(seeded.cookies);
    await page.goto("/books/new");
    await page
      .getByLabel("Título")
      .fill("Designing Data-Intensive Applications");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await page.getByLabel("Tipo").selectOption("part");
    await page.getByLabel("Títulos", { exact: true }).fill("Fundamentos");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page
      .getByRole("button", { name: "Adicionar em Fundamentos", exact: true })
      .click();
    await page
      .getByLabel("Capítulos", { exact: true })
      .fill("Confiabilidade\nEscalabilidade");
    await page
      .getByLabel("Capítulos", { exact: true })
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
    const tree = page.getByRole("tree", { name: "Sumário do livro" });
    await expect(
      tree.getByRole("treeitem", { name: /^Escalabilidade / }),
    ).toBeVisible();

    // Switch to the blocks: one group per part, a card per chapter.
    await page.getByRole("button", { name: "Blocos" }).click();
    await expect(tree).toBeHidden();
    const part = page.getByRole("region", { name: "Fundamentos" });
    await expect(part.getByRole("listitem")).toHaveCount(2);
    await expect(
      part.getByRole("progressbar", { name: "Progresso de Confiabilidade" }),
    ).toHaveAttribute("aria-valuenow", "0");

    // The choice survives a reload.
    await page.reload();
    await expect(page.getByRole("button", { name: "Blocos" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(part).toBeVisible();

    // On a phone-sized screen the cards stack without horizontal scrolling.
    await page.setViewportSize({ width: 375, height: 812 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);

    // A card leads to the chapter's page and notebook.
    await part.getByRole("link", { name: "Escalabilidade" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Escalabilidade" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Escrever anotação" }),
    ).toBeVisible();
  } finally {
    await seeded.cleanUp();
  }
});
