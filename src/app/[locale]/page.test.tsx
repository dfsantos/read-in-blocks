import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/pt-BR.json";
import Home from "./page";

describe("Home", () => {
  it("renders the app heading, a button and formatted values", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <Home />
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
