import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../../messages/pt-BR.json";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/session", () => ({ requireUser }));

import HomePage from "./page";

describe("HomePage", () => {
  it("requires a signed-in user before rendering", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("renders the app heading, a button and formatted values", async () => {
    requireUser.mockResolvedValue({ id: "user-1" });
    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        {await HomePage()}
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Read in Blocks" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("Data: 15 de outubro de 2026")).toBeInTheDocument();
    expect(screen.getByText("Número: 1.234,5")).toBeInTheDocument();
    expect(screen.getByText("Progresso: 42,5%")).toBeInTheDocument();
  });
});
