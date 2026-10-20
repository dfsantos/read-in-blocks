import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateBookResult } from "@/server/actions/books";

import messages from "../../../messages/pt-BR.json";

const push = vi.hoisted(() => vi.fn());
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));

import { BookForm } from "./book-form";

const BOOK_ID = "0b6f8f5e-5c55-4f0a-9d8e-2f1f2b7f3c11";

function renderForm(result: CreateBookResult) {
  const action = vi.fn().mockResolvedValue(result);
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <BookForm action={action} />
    </NextIntlClientProvider>,
  );
  return { action, user: userEvent.setup() };
}

const submit = () => screen.getByRole("button", { name: "Cadastrar" });

describe("BookForm", () => {
  beforeEach(() => push.mockClear());
  afterEach(cleanup);

  it("has a required title, an optional author and no other field", () => {
    renderForm({ ok: true, data: { id: BOOK_ID } });

    expect(screen.getByLabelText("Título")).toBeRequired();
    expect(screen.getByLabelText("Autor")).not.toBeRequired();
    expect(screen.getByLabelText("Autor")).toHaveAccessibleDescription(
      "Opcional.",
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("refuses a blank title in pt-BR without calling the server", async () => {
    const { action, user } = renderForm({ ok: true, data: { id: BOOK_ID } });

    await user.type(screen.getByLabelText("Título"), "   ");
    await user.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe o título do livro.",
    );
    expect(screen.getByLabelText("Título")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Título")).toHaveAccessibleDescription(
      "Informe o título do livro.",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("refuses an author over the limit", async () => {
    const { action, user } = renderForm({ ok: true, data: { id: BOOK_ID } });

    await user.type(screen.getByLabelText("Título"), "Refactoring");
    await user.click(screen.getByLabelText("Autor"));
    await user.paste("a".repeat(201));
    await user.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O autor pode ter no máximo 200 caracteres.",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("sends the trimmed values and opens the new book's page", async () => {
    const { action, user } = renderForm({ ok: true, data: { id: BOOK_ID } });

    await user.type(screen.getByLabelText("Título"), "  Refactoring ");
    await user.type(screen.getByLabelText("Autor"), " Martin Fowler ");
    await user.click(submit());

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/books/${BOOK_ID}`));
    expect(action).toHaveBeenCalledWith({
      title: "Refactoring",
      author: "Martin Fowler",
    });
  });

  it("sends an empty author when none is given", async () => {
    const { action, user } = renderForm({ ok: true, data: { id: BOOK_ID } });

    await user.type(screen.getByLabelText("Título"), "SICP");
    await user.click(submit());

    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action).toHaveBeenCalledWith({ title: "SICP", author: "" });
  });

  it("shows a field error answered by the server", async () => {
    const { user } = renderForm({
      ok: false,
      errorKey: "titleTooLong",
      field: "title",
    });

    await user.type(screen.getByLabelText("Título"), "Refactoring");
    await user.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O título pode ter no máximo 200 caracteres.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    [
      "rateLimited",
      "Muitos cadastros em pouco tempo. Aguarde um minuto e tente de novo.",
    ],
    ["failed", "Não foi possível cadastrar o livro. Tente de novo em instantes."],
  ] as const)(
    "shows the form error %s and lets the reader try again",
    async (errorKey, text) => {
      const { user } = renderForm({ ok: false, errorKey });

      await user.type(screen.getByLabelText("Título"), "Refactoring");
      await user.click(submit());

      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      expect(submit()).toBeEnabled();
      expect(push).not.toHaveBeenCalled();
    },
  );
});
