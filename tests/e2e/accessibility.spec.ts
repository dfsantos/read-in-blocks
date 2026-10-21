import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-025: every screen passes axe's WCAG 2.1 A and AA rules (contrast, names, roles, landmarks…)
// and fits a phone's width without scrolling sideways. Screenshots of each screen at phone, tablet
// and desktop widths go to test-results/screens for the visual review.
test.afterAll(closeTestAuth);
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

const WIDTHS = { phone: 375, tablet: 768, desktop: 1280 } as const;

async function audit(page: Page, screen: string) {
  // Buttons fade between colors after a click: contrast is measured once they settle.
  await page.waitForTimeout(300);
  const { violations: found } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  // An expanded treeitem holds the group of its children (the ARIA tree pattern), whose names are
  // not part of its own: label-content-name-mismatch reads them as unlabeled text. Only that case
  // is set aside; the row's own text is the whole of its name.
  const violations = found
    .map((violation) => ({
      ...violation,
      nodes: violation.nodes.filter(
        (node) =>
          !(
            violation.id === "label-content-name-mismatch" &&
            node.html.startsWith('<li role="treeitem"') &&
            node.html.includes('aria-expanded="true"')
          ),
      ),
    }))
    .filter((violation) => violation.nodes.length > 0);
  expect(
    violations.map(
      ({ id, nodes }) =>
        `${screen}: ${id} → ${nodes
          .map((node) => `${node.html} (${node.failureSummary ?? ""})`)
          .join(" | ")}`,
    ),
  ).toEqual([]);

  const viewport = page.viewportSize();
  for (const [name, width] of Object.entries(WIDTHS)) {
    await page.setViewportSize({ width, height: 900 });
    if (width === WIDTHS.phone) {
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${screen} scrolls sideways on a phone`).toBe(0);
    }
    await page.screenshot({
      path: `test-results/screens/${screen}-${name}.png`,
      fullPage: true,
    });
  }
  if (viewport) await page.setViewportSize(viewport);
}

test("every screen is accessible and fits a phone", async ({
  browser,
  page,
}) => {
  test.slow();

  // Signed out: the login page.
  const anonymous = await browser.newContext();
  try {
    const login = await anonymous.newPage();
    await login.goto("/login");
    await expect(
      login.getByRole("heading", { level: 1, name: "Entrar" }),
    ).toBeVisible();
    await expect(login).toHaveTitle("Entrar — Read in Blocks");
    // The app's own icon, not the framework's.
    await expect(
      login.locator('link[rel="icon"][type="image/svg+xml"]'),
    ).toHaveCount(1);
    const icon = await login.request.get("/icon.svg");
    expect(icon.status()).toBe(200);
    await audit(login, "login");
  } finally {
    await anonymous.close();
  }

  const seeded = await seedSession(E2E_ACCOUNTS.accessibility);
  try {
    await page.context().addCookies(seeded.cookies);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Nenhum livro ainda" }),
    ).toBeVisible();
    await audit(page, "library-empty");

    await page.goto("/books/new");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText("Informe o título do livro.")).toBeVisible();
    await audit(page, "book-new-error");
    await page.getByLabel("Título").fill("Refactoring");
    await page.getByLabel("Autor").fill("Martin Fowler");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Refactoring" }),
    ).toBeVisible();
    await audit(page, "book-empty");
    const bookUrl = page.url();

    await page.getByLabel("Tipo").selectOption("part");
    await page.getByLabel("Títulos", { exact: true }).fill("Fundamentos");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page
      .getByRole("button", { name: "Adicionar em Fundamentos" })
      .click();
    await page
      .getByLabel("Capítulos", { exact: true })
      .fill("Princípios\nMaus cheiros no código");
    await page
      .getByRole("list", { name: "Estrutura do livro" })
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
    const tree = page.getByRole("tree", { name: "Sumário do livro" });
    await expect(
      tree.getByRole("treeitem", { name: /^Maus cheiros no código / }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Estado de Princípios" })
      .selectOption("Concluído");
    await expect(page.getByText("“Princípios”: Concluído.")).toBeAttached();
    await tree.getByRole("treeitem", { name: /^Princípios / }).click();
    await audit(page, "book-toc");
    await page.getByRole("button", { name: "Blocos", exact: true }).click();
    await audit(page, "book-blocks");
    await page.getByRole("button", { name: "Excluir livro" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await audit(page, "book-delete-dialog");
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("link", { name: "Editar", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Editar livro" }),
    ).toBeVisible();
    await audit(page, "book-edit");

    await page.goto(bookUrl);
    await page.getByRole("button", { name: "Sumário", exact: true }).click();
    await tree.getByRole("treeitem", { name: /^Princípios / }).click();
    await page
      .getByRole("complementary", { name: "Princípios" })
      .getByRole("link", { name: "Abrir caderno" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Princípios" }),
    ).toBeVisible();
    await audit(page, "notebook-empty");
    await page.getByRole("button", { name: "Escrever anotação" }).click();
    const editor = page.getByRole("textbox", { name: "Nova anotação" });
    await editor.click();
    await page.keyboard.type("Refatorar em pequenos passos.");
    await page.getByRole("button", { name: "Diagrama" }).click();
    await expect(
      editor.getByRole("img", { name: "Diagrama da anotação" }),
    ).toBeVisible();
    await audit(page, "notebook-editor");
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(
      page
        .getByRole("list", { name: "Anotações de Princípios" })
        .getByRole("img", { name: "Diagrama da anotação" }),
    ).toBeVisible();
    await audit(page, "notebook-notes");

    await page.goto("/");
    await expect(
      page.getByRole("list", { name: "Seus livros" }).getByRole("listitem"),
    ).toHaveCount(1);
    await audit(page, "library");

    const missing = await page.goto(
      "/books/00000000-0000-4000-8000-000000000000",
    );
    expect(missing?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Página não encontrada — Read in Blocks");
    await audit(page, "not-found");
    const unknown = await page.goto("/um/endereco/qualquer");
    expect(unknown?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();
  } finally {
    await seeded.cleanUp();
  }
});
