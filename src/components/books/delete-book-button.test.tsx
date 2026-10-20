import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeleteBookResult } from "@/server/actions/books";

import messages from "../../../messages/pt-BR.json";

const replace = vi.hoisted(() => vi.fn());
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace }) }));

import { DeleteBookButton } from "./delete-book-button";

function renderButton(result: DeleteBookResult) {
  const action = vi.fn().mockResolvedValue(result);
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <DeleteBookButton title="Refactoring" action={action} />
    </NextIntlClientProvider>,
  );
  return { action, user: userEvent.setup() };
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Excluir livro" }));
  return screen.findByRole("alertdialog");
};

describe("DeleteBookButton", () => {
  beforeEach(() => replace.mockClear());
  afterEach(cleanup);

  it("deletes nothing until the reader confirms", async () => {
    const { action, user } = renderButton({ ok: true });

    const dialog = await open(user);

    expect(dialog).toHaveAccessibleName("Excluir “Refactoring”?");
    expect(dialog).toHaveAccessibleDescription(
      "O livro, a estrutura e as anotações dele serão apagados para sempre. Não é possível desfazer.",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("closes without deleting when the reader cancels", async () => {
    const { action, user } = renderButton({ ok: true });

    await open(user);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await vi.waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(action).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("deletes on confirmation and goes back to the library", async () => {
    const { action, user } = renderButton({ ok: true });

    await open(user);
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(action).toHaveBeenCalledOnce();
  });

  it.each([
    ["notFound", "Este livro não existe mais."],
    [
      "rateLimited",
      "Muitas exclusões em pouco tempo. Aguarde um minuto e tente de novo.",
    ],
    ["failed", "Não foi possível excluir o livro. Tente de novo em instantes."],
  ] as const)(
    "shows the error %s in the dialog and lets the reader try again",
    async (errorKey, text) => {
      const { user } = renderButton({ ok: false, errorKey });

      await open(user);
      await user.click(screen.getByRole("button", { name: "Excluir" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled();
      expect(replace).not.toHaveBeenCalled();
    },
  );
});
