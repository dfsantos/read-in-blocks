import { expect, test } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-015: the reader goes through the book's table of contents with the keyboard, opens a topic's
// details and completes it there, sees its chapter and part follow at once, and finds what they
// collapsed still collapsed after a reload, on a phone-sized screen too.
test.afterAll(closeTestAuth);

test("a reader navigates the table of contents and marks a topic from it", async ({
  context,
  page,
}) => {
  const seeded = await seedSession(E2E_ACCOUNTS.toc);
  try {
    await context.addCookies(seeded.cookies);
    await page.goto("/books/new");
    await page.getByLabel("Título").fill("Domain-Driven Design");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Domain-Driven Design" }),
    ).toBeVisible();

    // A part with a chapter and two topics, built with the structure editor.
    await page.getByLabel("Tipo").selectOption("part");
    await page.getByLabel("Títulos", { exact: true }).fill("Parte I");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page
      .getByRole("button", { name: "Adicionar em Parte I", exact: true })
      .click();
    await page
      .getByLabel("Capítulos", { exact: true })
      .fill("Linguagem ubíqua");
    await page
      .getByLabel("Capítulos", { exact: true })
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Adicionar em Linguagem ubíqua",
        exact: true,
      })
      .click();
    await page.getByLabel("Tópicos").fill("Modelo\nDiálogo");
    await page
      .getByLabel("Tópicos")
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();

    const tree = page.getByRole("tree", { name: "Sumário do livro" });
    const item = (name: string) =>
      tree.getByRole("treeitem", { name: new RegExp(`^${name} `) });
    await expect(item("Diálogo")).toBeVisible();
    await expect(item("Parte I")).toHaveAccessibleName(
      "Parte I Não iniciado · 0 de 2 concluídos",
    );

    // Keyboard: into the tree, down to the first topic, Enter opens its details.
    await item("Parte I").focus();
    await page.keyboard.press("ArrowRight");
    await expect(item("Linguagem ubíqua")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(item("Modelo")).toBeFocused();
    await page.keyboard.press("Enter");
    const details = page.getByRole("complementary", { name: "Modelo" });
    await details.getByLabel("Estado de Modelo").selectOption("completed");
    // The tree changes at once; the select comes back once the server has saved it.
    await expect(details.getByLabel("Estado de Modelo")).toBeEnabled();
    await expect(item("Linguagem ubíqua")).toHaveAccessibleName(
      "Linguagem ubíqua Em andamento · 1 de 2 concluídos",
    );
    await expect(item("Parte I")).toHaveAccessibleName(
      "Parte I Em andamento · 1 de 2 concluídos",
    );

    // Collapse the chapter with the keyboard; it stays collapsed after a reload.
    await item("Linguagem ubíqua").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(item("Linguagem ubíqua")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await page.reload();
    await expect(item("Linguagem ubíqua")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(item("Modelo")).toHaveCount(0);
    await expect(item("Parte I")).toHaveAccessibleName(
      "Parte I Em andamento · 1 de 2 concluídos",
    );

    // On a phone-sized screen the tree and the details still fit, one above the other.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Expandir tudo" }).click();
    await item("Diálogo").click();
    await expect(
      page.getByRole("complementary", { name: "Diálogo" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  } finally {
    await seeded.cleanUp();
  }
});
