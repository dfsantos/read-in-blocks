import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/pt-BR.json";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/auth", () => ({ signOut }));

import { initials, UserMenu } from "./user-menu";

function renderMenu(image: string | null = null) {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <UserMenu name="Ada Lovelace Reader" image={image} />
    </NextIntlClientProvider>,
  );
}

describe("initials", () => {
  it("uses the first and last names", () => {
    expect(initials("Ada Lovelace Reader")).toBe("AR");
    expect(initials("  ada  ")).toBe("A");
    expect(initials("")).toBe("?");
  });
});

describe("UserMenu", () => {
  afterEach(cleanup);
  beforeEach(() => {
    signOut.mockReset();
    signOut.mockResolvedValue(undefined);
  });

  it("names the menu after the reader and shows initials without a photo", () => {
    renderMenu();

    expect(
      screen.getByRole("button", {
        name: "Abrir o menu de Ada Lovelace Reader",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("AR")).toBeInTheDocument();
  });

  it("signs out from the menu", async () => {
    renderMenu("https://lh3.googleusercontent.com/a/photo");

    await userEvent.click(
      screen.getByRole("button", {
        name: "Abrir o menu de Ada Lovelace Reader",
      }),
    );
    expect(await screen.findByText("Ada Lovelace Reader")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sair" }));

    expect(signOut).toHaveBeenCalledOnce();
  });
});
