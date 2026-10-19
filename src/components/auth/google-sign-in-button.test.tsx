import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/pt-BR.json";

const signInSocial = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social: signInSocial } },
}));

import { GoogleSignInButton } from "./google-sign-in-button";

function renderButton(callbackURL = "/") {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <GoogleSignInButton callbackURL={callbackURL} />
    </NextIntlClientProvider>,
  );
}

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    signInSocial.mockReset();
  });

  it("starts the Google sign-in with relative callback paths", async () => {
    signInSocial.mockReturnValue(new Promise(() => {}));
    renderButton();

    await userEvent.click(
      screen.getByRole("button", { name: "Entrar com Google" }),
    );

    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/login",
    });
    expect(
      screen.getByRole("button", { name: "Redirecionando…" }),
    ).toBeDisabled();
  });

  it("returns to the page the visitor tried to open", async () => {
    signInSocial.mockReturnValue(new Promise(() => {}));
    renderButton("/books?tab=notes");

    await userEvent.click(
      screen.getByRole("button", { name: "Entrar com Google" }),
    );

    expect(signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/books?tab=notes" }),
    );
  });

  it("shows a friendly message when the sign-in cannot start", async () => {
    signInSocial.mockResolvedValue({ error: { status: 500 } });
    renderButton();

    await userEvent.click(
      screen.getByRole("button", { name: "Entrar com Google" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível concluir o login. Tente de novo em instantes.",
    );
    expect(
      screen.getByRole("button", { name: "Entrar com Google" }),
    ).toBeEnabled();
  });
});
