import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildTree, type FlatNode } from "@/domain/structure/tree";

import messages from "../../../messages/pt-BR.json";

const refresh = vi.hoisted(() => vi.fn());
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { BookStructure, type StructureActions } from "./book-structure";

const NODES: FlatNode[] = [
  {
    id: "pre",
    parentId: null,
    kind: "chapter",
    title: "Prefácio",
    position: 0,
  },
  { id: "p1", parentId: null, kind: "part", title: "Parte I", position: 1 },
  { id: "c1", parentId: "p1", kind: "chapter", title: "Um", position: 0 },
  { id: "t1", parentId: "c1", kind: "topic", title: "1.1", position: 0 },
  { id: "t2", parentId: "c1", kind: "topic", title: "1.2", position: 1 },
];

function renderStructure(
  nodes: FlatNode[] = NODES,
  overrides: Partial<StructureActions> = {},
) {
  const actions = {
    add: vi.fn().mockResolvedValue({ ok: true, data: { count: 2 } }),
    rename: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <BookStructure tree={buildTree(nodes)} actions={actions} />
    </NextIntlClientProvider>,
  );
  return { actions, user: userEvent.setup() };
}

describe("BookStructure", () => {
  beforeEach(() => refresh.mockClear());
  afterEach(cleanup);

  it("invites the reader to start when the book has no structure", () => {
    renderStructure([]);

    expect(
      screen.getByText(
        "Nenhuma parte ou capítulo ainda. Cole a lista do sumário abaixo para começar.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    // At the root, parts and chapters (D-06).
    expect(
      within(screen.getByLabelText("Tipo"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Parte", "Capítulo"]);
  });

  it("shows the structure as nested lists, in order, with each node's kind", () => {
    renderStructure();

    const root = screen.getByRole("list", { name: "Estrutura do livro" });
    const items = within(root).getAllByRole("listitem");
    expect(items.map((item) => item.firstElementChild?.textContent)).toEqual([
      expect.stringMatching(/^CapítuloPrefácio/),
      expect.stringMatching(/^ParteParte I/),
      expect.stringMatching(/^CapítuloUm/),
      expect.stringMatching(/^Tópico1\.1/),
      expect.stringMatching(/^Tópico1\.2/),
    ]);
    // Parts take chapters and chapters take topics; nothing goes below a topic.
    expect(
      screen.getByRole("button", { name: "Adicionar em Parte I" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar em Um" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Adicionar em 1.1" }),
    ).not.toBeInTheDocument();
  });

  it("adds several pasted chapters at the root and stays ready for the next paste", async () => {
    const { actions, user } = renderStructure([]);

    await user.selectOptions(screen.getByLabelText("Tipo"), "chapter");
    await user.click(screen.getByLabelText("Títulos"));
    await user.paste("1. Introdução\n2. Modelos\n");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "2 itens adicionados.",
      ),
    );
    expect(actions.add).toHaveBeenCalledWith(null, {
      kind: "chapter",
      titles: "1. Introdução\n2. Modelos\n",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Títulos")).toHaveValue("");
    expect(screen.getByLabelText("Tipo")).toHaveValue("chapter");
  });

  it("refuses an empty paste without calling the server", async () => {
    const { actions, user } = renderStructure([]);

    await user.type(screen.getByLabelText("Títulos"), "   ");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(
      await screen.findByText("Informe ao menos um título."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Títulos")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(actions.add).not.toHaveBeenCalled();
  });

  it.each([
    ["tooManyNodes", "Um livro pode ter no máximo 2.000 itens na estrutura."],
    [
      "rateLimited",
      "Muitas alterações em pouco tempo. Aguarde um minuto e tente de novo.",
    ],
    ["notFound", "Este item não existe mais. Recarregue a página."],
  ] as const)("shows the server's %s answer", async (errorKey, text) => {
    const { user } = renderStructure([], {
      add: vi.fn().mockResolvedValue({ ok: false, errorKey }),
    });

    await user.type(screen.getByLabelText("Títulos"), "Um");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("adds topics inside a chapter", async () => {
    const { actions, user } = renderStructure();

    await user.click(screen.getByRole("button", { name: "Adicionar em Um" }));
    // One kind only: no choice, the label says what is added.
    const titles = screen.getByLabelText("Tópicos");
    expect(titles).toHaveFocus();
    await user.type(titles, "1.3");
    const form = titles.closest("form") as HTMLFormElement;
    await user.click(within(form).getByRole("button", { name: "Adicionar" }));

    await vi.waitFor(() => expect(actions.add).toHaveBeenCalledOnce());
    expect(actions.add).toHaveBeenCalledWith("c1", {
      kind: "topic",
      titles: "1.3",
    });
  });

  it("renames a node in place", async () => {
    const { actions, user } = renderStructure();

    await user.click(screen.getByRole("button", { name: "Renomear Um" }));
    const input = screen.getByLabelText("Novo título de Um");
    expect(input).toHaveValue("Um");
    await user.clear(input);
    await user.type(input, "Capítulo um");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() =>
      expect(
        screen.queryByLabelText("Novo título de Um"),
      ).not.toBeInTheDocument(),
    );
    expect(actions.rename).toHaveBeenCalledWith("c1", { title: "Capítulo um" });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("leaves the title as it was when the reader cancels a rename", async () => {
    const { actions, user } = renderStructure();

    await user.click(screen.getByRole("button", { name: "Renomear Um" }));
    await user.type(
      screen.getByLabelText("Novo título de Um"),
      " mudado{Escape}",
    );

    expect(
      screen.queryByLabelText("Novo título de Um"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Um")).toBeInTheDocument();
    expect(actions.rename).not.toHaveBeenCalled();
  });

  it("refuses a blank rename without calling the server", async () => {
    const { actions, user } = renderStructure();

    await user.click(screen.getByRole("button", { name: "Renomear Um" }));
    await user.clear(screen.getByLabelText("Novo título de Um"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Informe o título.")).toBeInTheDocument();
    expect(actions.rename).not.toHaveBeenCalled();
  });

  it("asks before deleting a node and says how many nodes go with it", async () => {
    const { actions, user } = renderStructure();

    await user.click(screen.getByRole("button", { name: "Excluir Parte I" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Excluir “Parte I”?");
    expect(dialog).toHaveAccessibleDescription(
      "Os 3 itens dentro dele também serão excluídos. Não é possível desfazer.",
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(actions.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Excluir Parte I" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Excluir",
      }),
    );
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(actions.remove).toHaveBeenCalledWith("p1");
  });

  it("confirms the deletion of a leaf too, and shows a refusal", async () => {
    const { user } = renderStructure(NODES, {
      remove: vi.fn().mockResolvedValue({ ok: false, errorKey: "notFound" }),
    });

    await user.click(screen.getByRole("button", { name: "Excluir 1.1" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleDescription("Não é possível desfazer.");
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Este item não existe mais. Recarregue a página.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
