import { expect, test, type Page } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-022: the reader inserts a Mermaid diagram in a note, previews it while writing and sees it
// drawn in the read-only view, under the production CSP. A hostile diagram (HTML in labels, click
// handlers, a directive asking for the loose security level) runs nothing, and a diagram with a
// syntax error shows a message without breaking the rest of the note.
test.afterAll(closeTestAuth);
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

// Types the lines of a code block (Enter keeps the reader inside it).
async function typeLines(page: Page, lines: readonly string[]) {
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
}

test("a reader draws diagrams in a note, safely", async ({ page }) => {
  test.slow();
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  // Mermaid is downloaded only when the first diagram is drawn: its scripts are recognized by a
  // name only its core has.
  const scripts: Promise<string>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") {
      scripts.push(response.text().catch(() => ""));
    }
  });
  const mermaidLoaded = async () =>
    (await Promise.all(scripts)).some((body) =>
      body.includes("registerExternalDiagrams"),
    );
  const seeded = await seedSession(E2E_ACCOUNTS.diagrams);
  try {
    await page.context().addCookies(seeded.cookies);
    await page.goto("/books/new");
    await page.getByLabel("Título").fill("Domain-Driven Design");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await page.getByLabel("Tipo").selectOption("chapter");
    await page.getByLabel("Títulos", { exact: true }).fill("Contextos");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page
      .getByRole("tree", { name: "Sumário do livro" })
      .getByRole("treeitem", { name: /^Contextos / })
      .click();
    await page
      .getByRole("complementary", { name: "Contextos" })
      .getByRole("link", { name: "Abrir caderno" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Contextos" }),
    ).toBeVisible();
    const list = page.getByRole("list", { name: "Anotações de Contextos" });

    // The toolbar's button inserts a starting diagram, previewed under its text.
    await page.getByRole("button", { name: "Escrever anotação" }).click();
    const editor = page.getByRole("textbox", { name: "Nova anotação" });
    await editor.click();
    await page.keyboard.type("Mapa de contextos");
    await page.keyboard.press("Enter");
    expect(await mermaidLoaded()).toBe(false);
    await page.getByRole("button", { name: "Diagrama" }).click();
    await expect(editor.locator("pre")).toContainText(
      "A[Ideia] --> B[Conceito]",
    );
    await expect(
      editor.getByRole("img", { name: "Diagrama da anotação" }),
    ).toBeVisible();
    expect(await mermaidLoaded()).toBe(true);
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);

    // The read-only view draws it as an image the browser decoded, labels included.
    const drawn = list
      .getByRole("listitem")
      .nth(0)
      .getByRole("img", { name: "Diagrama da anotação" });
    await expect(drawn).toBeVisible();
    await expect(drawn).toHaveAttribute("src", /^data:image\/svg\+xml/);
    expect(
      await drawn.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);
    expect(
      decodeURIComponent((await drawn.getAttribute("src")) ?? ""),
    ).toContain("Ideia");
    await expect(list.getByText("Mapa de contextos")).toBeVisible();

    // A hostile diagram, typed in a code block turned into a diagram.
    await page.getByRole("button", { name: "Escrever anotação" }).click();
    await page.getByRole("textbox", { name: "Nova anotação" }).click();
    await page
      .getByRole("button", { name: "Bloco de código (Ctrl+Alt+C)" })
      .click();
    await typeLines(page, [
      '%%{init: {"securityLevel": "loose", "htmlLabels": true}}%%',
      "flowchart LR",
      '  A["<img src=x onerror=window.pwned=1>"] --> B["<script>window.pwned=1</script>"]',
      "  click A call alert(1)",
      '  click B href "javascript:window.pwned=1"',
    ]);
    await page
      .getByRole("combobox", { name: "Linguagem do bloco de código" })
      .selectOption({ label: "Diagrama (Mermaid)" });
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    const hostile = list
      .getByRole("listitem")
      .nth(1)
      .getByRole("img", { name: "Diagrama da anotação" });
    await expect(hostile).toBeVisible();
    await hostile.click();
    const source = decodeURIComponent(
      (await hostile.getAttribute("src")) ?? "",
    );
    expect(source).not.toMatch(/<script|onerror=|javascript:|<foreignObject/i);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator("main script")).toHaveCount(0);
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);
    expect(dialogs).toEqual([]);

    // A syntax error: a message and the text, the rest of the note intact.
    await page.getByRole("button", { name: "Escrever anotação" }).click();
    await page.getByRole("textbox", { name: "Nova anotação" }).click();
    await page.keyboard.type("Antes do diagrama");
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Bloco de código (Ctrl+Alt+C)" })
      .click();
    await typeLines(page, ["flowchart LR", "  A -->>>> ((("]);
    await page
      .getByRole("combobox", { name: "Linguagem do bloco de código" })
      .selectOption({ label: "Diagrama (Mermaid)" });
    const message =
      "Não foi possível desenhar este diagrama: confira a sintaxe Mermaid.";
    await expect(
      page.getByRole("textbox", { name: "Nova anotação" }).getByText(message),
    ).toBeVisible();
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    const broken = list.getByRole("listitem").nth(2);
    await expect(broken.getByText(message)).toBeVisible();
    await expect(broken.getByText("Antes do diagrama")).toBeVisible();
    await expect(broken.getByText("A -->>>> (((")).toBeVisible();
    await expect(broken.getByRole("img")).toHaveCount(0);

    // After a reload the diagrams are drawn again from the stored text.
    await page.reload();
    await expect(
      list.getByRole("img", { name: "Diagrama da anotação" }),
    ).toHaveCount(2);
  } finally {
    await seeded.cleanUp();
  }
});
