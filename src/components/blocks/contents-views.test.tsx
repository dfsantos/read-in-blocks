import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/pt-BR.json";

const STORAGE_KEY = "read-in-blocks:contents-view";

async function renderViews() {
  // A fresh module per test: the remembered choice is also kept in memory.
  vi.resetModules();
  const { ContentsViews } = await import("./contents-views");
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <ContentsViews toc={<p>árvore</p>} blocks={<p>cartões</p>} />
    </NextIntlClientProvider>,
  );
  return userEvent.setup();
}

const button = (name: string) => screen.getByRole("button", { name });

describe("ContentsViews", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the table of contents by default", async () => {
    await renderViews();

    expect(
      screen.getByRole("group", { name: "Ver a estrutura como" }),
    ).toBeInTheDocument();
    expect(button("Sumário")).toHaveAttribute("aria-pressed", "true");
    expect(button("Blocos")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("árvore")).toBeVisible();
    expect(screen.getByText("cartões")).not.toBeVisible();
  });

  it("switches to the blocks and remembers the choice", async () => {
    const user = await renderViews();

    await user.click(button("Blocos"));

    expect(button("Blocos")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("cartões")).toBeVisible();
    expect(screen.getByText("árvore")).not.toBeVisible();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("blocks");

    cleanup();
    await renderViews();
    expect(screen.getByText("cartões")).toBeVisible();
  });

  it("ignores a tampered preference", async () => {
    localStorage.setItem(STORAGE_KEY, "<script>");

    await renderViews();

    expect(button("Sumário")).toHaveAttribute("aria-pressed", "true");
  });

  it("still switches when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = await renderViews();

    await user.click(button("Blocos"));

    expect(screen.getByText("cartões")).toBeVisible();
  });
});
