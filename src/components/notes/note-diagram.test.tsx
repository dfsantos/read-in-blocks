import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/pt-BR.json";
import { NoteDiagram } from "./note-diagram";

// Mermaid needs a real layout engine: here the drawing is faked, the E2E test draws for real.
const renderDiagram = vi.hoisted(() => vi.fn());
vi.mock("./diagram-renderer", () => ({ renderDiagram }));

const show = (source: string) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <NoteDiagram source={source} showSource />
    </NextIntlClientProvider>,
  );

describe("NoteDiagram", () => {
  afterEach(() => {
    cleanup();
    renderDiagram.mockReset();
  });

  it("shows the drawing as an image, with its text one click away", async () => {
    renderDiagram.mockResolvedValue({
      ok: true,
      image: {
        src: "data:image/svg+xml,x",
        width: 200,
        height: 80,
        title: "Fluxo",
      },
    });
    show("flowchart LR\n  A --> B");

    expect(screen.getByText("Desenhando o diagrama…")).toBeInTheDocument();
    const image = await screen.findByRole("img", { name: "Fluxo" });
    expect(image).toHaveAttribute("src", "data:image/svg+xml,x");
    expect(image).toHaveAttribute("width", "200");
    expect(screen.getByText("Ver o texto do diagrama")).toBeInTheDocument();
    expect(renderDiagram).toHaveBeenCalledWith("flowchart LR\n  A --> B");
  });

  it("explains a text it cannot draw and still shows it", async () => {
    renderDiagram.mockResolvedValue({ ok: false, reason: "syntax" });
    show("flowchart LR\n  A -->");

    expect(
      await screen.findByText(
        "Não foi possível desenhar este diagrama: confira a sintaxe Mermaid.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/A -->/)).toBeVisible();
  });

  it("says when the drawing library could not be loaded", async () => {
    renderDiagram.mockResolvedValue({ ok: false, reason: "unavailable" });
    show("flowchart LR\n  A --> B");

    expect(
      await screen.findByText(/Não foi possível carregar o diagrama agora/),
    ).toBeInTheDocument();
  });
});
