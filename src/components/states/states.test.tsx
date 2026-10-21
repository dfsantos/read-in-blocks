import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import NotFound from "../../app/[locale]/not-found";
import messages from "../../../messages/pt-BR.json";
import { ErrorMessage } from "./error-message";

const inPortuguese = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );

// The app's own 404 and error pages (US-025), in Portuguese, with a way out.
describe("state pages", () => {
  afterEach(cleanup);

  it("tells the reader a page was not found and leads back to the library", () => {
    inPortuguese(<NotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar para a biblioteca" }),
    ).toHaveAttribute("href", "/");
  });

  it("offers to try again after an error, without showing the error", async () => {
    const retry = vi.fn();
    inPortuguese(<ErrorMessage retry={retry} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Algo deu errado" }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("link", { name: "Voltar para a biblioteca" }),
    ).toBeInTheDocument();
  });
});
