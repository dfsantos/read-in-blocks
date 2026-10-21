import { expect, test } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-018, US-019 and US-020: the reader opens a chapter's notebook from the table of contents, writes
// formatted notes (toolbar, shortcuts, highlighted code), sees pasted and typed markup neutralized,
// edits with automatic saving, gives notes a kind (a quote with its page, a resolved action) and
// filters by kind, deletes notes, sees the count in the table of contents, and another reader gets the
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
    await page.getByLabel("Tipo").selectOption("chapter");
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

    // Write two notes: one formatted with the toolbar and shortcuts, one with markup typed as
    // text. The editor is only downloaded when the reader starts writing.
    await page.getByRole("button", { name: "Escrever anotação" }).click();
    const editor = page.getByRole("textbox", { name: "Nova anotação" });
    await editor.click();
    await page.keyboard.type("Regra da dependência");
    await page.keyboard.press("Control+Alt+3");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("aponta ");
    await page.keyboard.press("Control+B");
    await page.keyboard.type("para dentro");
    await page.keyboard.press("Control+B");
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Bloco de código (Ctrl+Alt+C)" })
      .click();
    await expect(editor.locator("pre")).toBeVisible();
    await page.keyboard.type("const core = () => {}");
    await page
      .getByRole("combobox", { name: "Linguagem do bloco de código" })
      .selectOption({ label: "TypeScript" });
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(page.getByText("1 anotação")).toBeVisible();

    // The second one is a quote (US-020): its page is required.
    await page.getByRole("button", { name: "Escrever anotação" }).click();
    await page.getByLabel("Tipo da anotação").selectOption("Citação");
    await page.getByLabel("Página ou posição").fill("p. 42");
    await page
      .getByRole("textbox", { name: "Nova anotação" })
      .fill("<b>Plugins</b><script>window.pwned = 1</script>");
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    const list = page.getByRole("list", { name: "Anotações de Fronteiras" });
    await expect(list.getByRole("listitem")).toHaveCount(2);

    // The read-only view: same formatting, highlighted code, markup as text.
    const first = list.getByRole("listitem").nth(0);
    await expect(
      first.getByRole("heading", { level: 3, name: "Regra da dependência" }),
    ).toBeVisible();
    await expect(first.locator("strong")).toHaveText("para dentro");
    await expect(
      first.locator("pre code.language-typescript .hljs-keyword"),
    ).toHaveText("const");
    await expect(list.getByRole("listitem").nth(1)).toContainText(
      "<b>Plugins</b><script>window.pwned = 1</script>",
    );
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);

    // Pasted HTML keeps the formatting the notebook offers and drops the rest.
    await page.getByRole("button", { name: "Escrever anotação" }).click();
    await page.getByRole("textbox", { name: "Nova anotação" }).click();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData(
        "text/html",
        '<p><em>colado</em><img src="x" onerror="window.pwned = 1"> <a href="javascript:window.pwned = 1">mau</a></p>',
      );
      document.activeElement?.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
      );
    });
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    const pasted = list.getByRole("listitem").nth(2);
    await expect(pasted.locator("em")).toHaveText("colado");
    await expect(pasted.locator("img")).toHaveCount(0);
    await expect(pasted.getByRole("link")).toHaveCount(0);
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);
    await pasted
      .getByRole("button", { name: /^Excluir a anotação de / })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir anotação" })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(2);

    // Edit the first one: saved on its own, and it shows when it was edited.
    await first.getByRole("button", { name: /^Editar a anotação de / }).click();
    const editing = page.getByRole("textbox", { name: "Texto da anotação" });
    await editing.getByText("para dentro").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" sempre");
    await expect(page.getByText("Salvo", { exact: true })).toBeVisible();
    await page.reload();
    await expect(list.getByRole("listitem").nth(0)).toContainText(
      "aponta para dentro sempre",
    );
    await expect(list.getByRole("listitem").nth(0)).toContainText("editada em");

    // Kinds (US-020): the first one becomes an action, resolved; the filter shows each kind.
    await expect(list.getByRole("listitem").nth(0)).toContainText(
      "Conceito-chave",
    );
    await expect(list.getByRole("listitem").nth(1)).toContainText("Citação");
    await expect(list.getByRole("listitem").nth(1)).toContainText("p. 42");
    await list
      .getByRole("listitem")
      .nth(0)
      .getByRole("button", { name: /^Editar a anotação de / })
      .click();
    await page.getByLabel("Tipo da anotação").selectOption("Ação/dúvida");
    await expect(page.getByText("Salvo", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Concluir edição" }).click();
    await list
      .getByRole("listitem")
      .nth(0)
      .getByRole("button", { name: /^Marcar como resolvida a anotação de / })
      .click();
    await expect(list.getByRole("listitem").nth(0)).toContainText(
      "Ação/dúvidaResolvida",
    );
    const filter = page.getByRole("group", { name: "Filtrar por tipo" });
    await filter.getByRole("button", { name: "Citações (1)" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("listitem")).toContainText("Plugins");
    await filter.getByRole("button", { name: "Todas (2)" }).click();

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
    // And the chapter heads the most noted ones (US-024).
    await expect(
      page
        .getByRole("list", {
          name: "Capítulos com mais anotações, do mais anotado ao menos",
        })
        .getByRole("listitem"),
    ).toHaveText(["FronteirasMuitas anotações: 1 anotação"]);

    // Another reader gets the 404 page for that notebook.
    const other = await browser.newContext();
    try {
      await other.addCookies(intruder.cookies);
      const otherPage = await other.newPage();
      const response = await otherPage.goto(notebookUrl);
      expect(response?.status()).toBe(404);
      await expect(otherPage.getByText("Regra da dependência")).toHaveCount(0);
    } finally {
      await other.close();
    }
  } finally {
    await seeded.cleanUp();
    await intruder.cleanUp();
  }
});
