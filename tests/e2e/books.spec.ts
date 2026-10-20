import { expect, test, type BrowserContext } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-007 and US-008: create a book from the empty library, land on its page, find it in the library;
// another reader neither lists it nor opens it (404).
// Tests that seed share accounts, so this file runs serially.
test.describe.configure({ mode: "serial" });
test.afterAll(closeTestAuth);

const cleanUps: Array<() => Promise<void>> = [];

async function signIn(context: BrowserContext, email: string) {
  const seeded = await seedSession(email);
  cleanUps.push(seeded.cleanUp);
  await context.clearCookies();
  await context.addCookies(seeded.cookies);
  return seeded.cookies;
}

test.afterEach(async () => {
  // Deleting the readers deletes their books (ON DELETE CASCADE).
  for (const cleanUp of cleanUps.splice(0)) await cleanUp();
});

test("a reader creates a book, finds it in the library, and only they see it", async ({
  context,
  page,
}) => {
  await signIn(context, E2E_ACCOUNTS.books);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 2, name: "Nenhum livro ainda" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cadastrar o primeiro livro" }).click();
  await expect(page).toHaveURL("/books/new");
  await expect(
    page.getByRole("heading", { level: 1, name: "Cadastrar livro" }),
  ).toBeVisible();

  // The title is required, in pt-BR, before anything reaches the server.
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByLabel("Título")).toHaveAccessibleDescription(
    "Informe o título do livro.",
  );

  await page.getByLabel("Título").fill("Domain-Driven Design");
  await page.getByLabel("Autor").fill("Eric Evans");
  await page.getByRole("button", { name: "Cadastrar" }).click();

  await expect(page).toHaveURL(
    /^http:\/\/localhost:3000\/books\/[0-9a-f-]{36}$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Domain-Driven Design" }),
  ).toBeVisible();
  await expect(page.getByText("de Eric Evans")).toBeVisible();
  await expect(page).toHaveTitle("Domain-Driven Design — Read in Blocks");
  const bookUrl = page.url();

  // The library lists it and opens it.
  await page.getByRole("link", { name: "Voltar para a biblioteca" }).click();
  await expect(page).toHaveURL("/");
  const library = page.getByRole("list", { name: "Seus livros" });
  await expect(library.getByRole("link")).toHaveCount(1);
  await library.getByRole("link", { name: /Domain-Driven Design/ }).click();
  await expect(page).toHaveURL(bookUrl);

  // Another reader opening the same URL gets the same 404 as a book that does not exist.
  await signIn(context, E2E_ACCOUNTS.booksIntruder);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 2, name: "Nenhum livro ainda" }),
  ).toBeVisible();
  await expect(page.getByText("Domain-Driven Design")).toHaveCount(0);
  const foreign = await page.goto(bookUrl);
  expect(foreign?.status()).toBe(404);
  await expect(page.getByText("Domain-Driven Design")).toHaveCount(0);

  const missing = await page.goto(
    "/books/00000000-0000-4000-8000-000000000000",
  );
  expect(missing?.status()).toBe(404);
  const malformed = await page.goto("/books/not-a-uuid");
  expect(malformed?.status()).toBe(404);
});

// US-009: the reader fixes the title and author, then deletes the book after confirming; another
// reader gets the 404 page for the edit page (the actions on a foreign id are covered by
// tests/integration/book-actions.test.ts).
test("a reader edits a book and deletes it after confirming", async ({
  context,
  page,
}) => {
  const ownerCookies = await signIn(context, E2E_ACCOUNTS.books);
  await page.goto("/books/new");
  await page.getByLabel("Título").fill("Refactorng");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page).toHaveURL(
    /^http:\/\/localhost:3000\/books\/[0-9a-f-]{36}$/,
  );
  const bookUrl = page.url();

  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(`${bookUrl}/edit`);
  await expect(page).toHaveTitle("Editar Refactorng — Read in Blocks");
  await expect(page.getByLabel("Título")).toHaveValue("Refactorng");
  await page.getByLabel("Título").fill("Refactoring");
  await page.getByLabel("Autor").fill("Martin Fowler");
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page).toHaveURL(bookUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: "Refactoring" }),
  ).toBeVisible();
  await expect(page.getByText("de Martin Fowler")).toBeVisible();

  // Another reader gets the 404 page for the edit page too.
  await signIn(context, E2E_ACCOUNTS.booksIntruder);
  const foreign = await page.goto(`${bookUrl}/edit`);
  expect(foreign?.status()).toBe(404);
  await expect(page.getByText("Refactoring")).toHaveCount(0);

  // Back as the owner: cancelling the dialog keeps the book.
  await context.clearCookies();
  await context.addCookies(ownerCookies);
  await page.goto(bookUrl);
  await page.getByRole("button", { name: "Excluir livro" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Excluir “Refactoring”?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: "Refactoring" }),
  ).toBeVisible();

  // Confirming deletes it and goes back to the library, now empty.
  await page.getByRole("button", { name: "Excluir livro" }).click();
  await dialog.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { level: 2, name: "Nenhum livro ainda" }),
  ).toBeVisible();
  const gone = await page.goto(bookUrl);
  expect(gone?.status()).toBe(404);
});
