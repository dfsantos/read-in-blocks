import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildTree, type FlatNode } from "@/domain/structure/tree";

import messages from "../../../messages/pt-BR.json";

const refresh = vi.hoisted(() => vi.fn());
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { BookStructure, type StructureActions } from "./book-structure";

const node = (
  id: string,
  parentId: string | null,
  kind: FlatNode["kind"],
  title: string,
  position: number,
  details: Partial<
    Pick<
      FlatNode,
      "summary" | "goalPages" | "status" | "startedAt" | "completedAt"
    >
  > = {},
): FlatNode => ({
  id,
  parentId,
  kind,
  title,
  position,
  summary: null,
  goalPages: null,
  status: "not_started",
  startedAt: null,
  completedAt: null,
  ...details,
});

const NODES: FlatNode[] = [
  node("pre", null, "chapter", "Prefácio", 0, { goalPages: 10 }),
  node("p1", null, "part", "Parte I", 1),
  node("c1", "p1", "chapter", "Um", 0, {
    summary: "Sobre o começo.\nE o resto.",
    goalPages: 1,
  }),
  node("t1", "c1", "topic", "1.1", 0),
  node("t2", "c1", "topic", "1.2", 1),
];

function renderStructure(
  nodes: FlatNode[] = NODES,
  overrides: Partial<StructureActions> = {},
) {
  const actions = {
    add: vi.fn().mockResolvedValue({ ok: true, data: { count: 2 } }),
    update: vi.fn().mockResolvedValue({ ok: true }),
    move: vi.fn().mockResolvedValue({ ok: true }),
    setStatus: vi.fn().mockResolvedValue({ ok: true }),
    setDates: vi.fn().mockResolvedValue({ ok: true }),
    completeAll: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { completed: 2 } }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
  render(
    <NextIntlClientProvider
      locale="pt-BR"
      messages={messages}
      timeZone="America/Sao_Paulo"
    >
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
      expect(
        within(
          screen.getByLabelText("Títulos").closest("form") as HTMLFormElement,
        ).getByRole("status"),
      ).toHaveTextContent("2 itens adicionados."),
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
    ["notFound", "Este item não existe mais. Atualize a página."],
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

  it("shows each node's goal, or that it takes the default weight, and its summary", () => {
    renderStructure();

    const item = (title: string) =>
      screen.getByText(title, { selector: "span" })
        .parentElement as HTMLElement;
    expect(item("Prefácio")).toHaveTextContent("10 páginas");
    // No goal: the default weight of its siblings (ADR-0009, D-16).
    expect(item("Parte I")).toHaveTextContent("Peso padrão");
    expect(item("Um")).toHaveTextContent("1 página");
    expect(item("1.1")).toHaveTextContent("Peso padrão");
    expect(screen.getByText(/Sobre o começo\./)).toHaveTextContent(
      "Sobre o começo. E o resto.",
    );
  });

  it("edits a node's title, summary and goal in place", async () => {
    const { actions, user } = renderStructure();

    await user.click(screen.getByRole("button", { name: "Editar Um" }));
    const form = screen.getByRole("form", { name: "Editar Um" });
    expect(within(form).getByLabelText("Título")).toHaveValue("Um");
    expect(within(form).getByLabelText("Resumo")).toHaveValue(
      "Sobre o começo.\nE o resto.",
    );
    expect(within(form).getByLabelText("Meta (páginas)")).toHaveValue("1");

    await user.clear(within(form).getByLabelText("Título"));
    await user.type(within(form).getByLabelText("Título"), "Capítulo um");
    await user.clear(within(form).getByLabelText("Resumo"));
    await user.clear(within(form).getByLabelText("Meta (páginas)"));
    await user.type(within(form).getByLabelText("Meta (páginas)"), "25");
    await user.click(within(form).getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() =>
      expect(
        screen.queryByRole("form", { name: "Editar Um" }),
      ).not.toBeInTheDocument(),
    );
    expect(actions.update).toHaveBeenCalledWith("c1", {
      title: "Capítulo um",
      summary: "",
      goalPages: "25",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("starts the edit of a node without goal or summary from empty fields", async () => {
    const { user } = renderStructure();

    await user.click(screen.getByRole("button", { name: "Editar Parte I" }));
    const form = screen.getByRole("form", { name: "Editar Parte I" });
    expect(within(form).getByLabelText("Resumo")).toHaveValue("");
    expect(within(form).getByLabelText("Meta (páginas)")).toHaveValue("");
    expect(
      within(form).getByLabelText("Meta (páginas)"),
    ).toHaveAccessibleDescription(
      "Opcional. Sem meta, o item usa o peso padrão: a média das metas dos itens ao lado.",
    );
  });

  it("leaves the node as it was when the reader cancels the edit", async () => {
    const { actions, user } = renderStructure();

    await user.click(screen.getByRole("button", { name: "Editar Um" }));
    await user.type(
      within(screen.getByRole("form", { name: "Editar Um" })).getByLabelText(
        "Título",
      ),
      " mudado{Escape}",
    );

    expect(
      screen.queryByRole("form", { name: "Editar Um" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Um", { selector: "span" })).toBeInTheDocument();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it.each([
    ["Título", "", "Informe o título."],
    [
      "Meta (páginas)",
      "0",
      "A meta deve ser um número inteiro de páginas, de 1 a 10.000.",
    ],
    [
      "Meta (páginas)",
      "2,5",
      "A meta deve ser um número inteiro de páginas, de 1 a 10.000.",
    ],
  ])(
    "refuses %s set to %j without calling the server",
    async (label, value, text) => {
      const { actions, user } = renderStructure();

      await user.click(screen.getByRole("button", { name: "Editar Um" }));
      const form = screen.getByRole("form", { name: "Editar Um" });
      await user.clear(within(form).getByLabelText(label));
      if (value) await user.type(within(form).getByLabelText(label), value);
      await user.click(within(form).getByRole("button", { name: "Salvar" }));

      expect(await within(form).findByText(text)).toBeInTheDocument();
      expect(within(form).getByLabelText(label)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(actions.update).not.toHaveBeenCalled();
    },
  );

  it("shows the server's answer on the field it belongs to", async () => {
    const { user } = renderStructure(NODES, {
      update: vi.fn().mockResolvedValue({
        ok: false,
        errorKey: "summaryTooLong",
        field: "summary",
      }),
    });

    await user.click(screen.getByRole("button", { name: "Editar Um" }));
    const form = screen.getByRole("form", { name: "Editar Um" });
    await user.click(within(form).getByRole("button", { name: "Salvar" }));

    expect(
      await within(form).findByText(
        "O resumo pode ter no máximo 1.000 caracteres.",
      ),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Resumo")).toHaveFocus();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("moves a node up and down among its siblings, never past the ends", async () => {
    const { actions, user } = renderStructure();

    expect(
      screen.getByRole("button", { name: "Subir Prefácio" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Descer Parte I" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Subir 1.1" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Subir Parte I" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    // Announced: the moved item may lose focus.
    expect(
      screen
        .getAllByRole("status")
        .some((status) =>
          status.textContent?.includes("“Parte I” foi movido."),
        ),
    ).toBe(true);
    expect(actions.move).toHaveBeenLastCalledWith("p1", {
      parentId: null,
      index: 0,
    });

    await user.click(screen.getByRole("button", { name: "Descer 1.1" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(actions.move).toHaveBeenLastCalledWith("t1", {
      parentId: "c1",
      index: 1,
    });
  });

  it("keeps the focus on a moved item when it reaches the end of the list", async () => {
    const move = vi.fn().mockResolvedValue({ ok: true });
    const actions = {
      add: vi.fn(),
      update: vi.fn(),
      move,
      setStatus: vi.fn(),
      setDates: vi.fn(),
      completeAll: vi.fn(),
      remove: vi.fn(),
    } as unknown as StructureActions;
    const view = (nodes: FlatNode[]) => (
      <NextIntlClientProvider
        locale="pt-BR"
        messages={messages}
        timeZone="America/Sao_Paulo"
      >
        <BookStructure tree={buildTree(nodes)} actions={actions} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view(NODES));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Subir Parte I" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    // The refreshed page brings Parte I to the top, where Subir is disabled.
    rerender(
      view(
        NODES.map((item) =>
          item.id === "p1"
            ? { ...item, position: 0 }
            : item.id === "pre"
              ? { ...item, position: 1 }
              : item,
        ),
      ),
    );

    expect(
      screen.getByRole("button", { name: "Subir Parte I" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Descer Parte I" }),
    ).toHaveFocus();
  });

  it("reorders by dragging a node onto a sibling, and only onto a sibling", async () => {
    const { actions } = renderStructure();
    const row = (title: string) =>
      screen
        .getByText(title, { selector: "span" })
        .closest("[draggable]") as HTMLElement;
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.dragStart(row("1.2"), { dataTransfer });
    // Not a sibling: the drop is not accepted.
    const overPart = createEvent.dragOver(row("Parte I"), { dataTransfer });
    fireEvent(row("Parte I"), overPart);
    expect(overPart.defaultPrevented).toBe(false);

    const overSibling = createEvent.dragOver(row("1.1"), { dataTransfer });
    fireEvent(row("1.1"), overSibling);
    expect(overSibling.defaultPrevented).toBe(true);
    fireEvent.drop(row("1.1"), { dataTransfer });

    await vi.waitFor(() =>
      expect(actions.move).toHaveBeenCalledWith("t2", {
        parentId: "c1",
        index: 0,
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("moves a chapter to the book's root and a topic to another chapter", async () => {
    const { actions, user } = renderStructure();

    // A part only reorders: it has nowhere else to go.
    expect(
      screen.queryByRole("button", { name: "Mover Parte I" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mover Um" }));
    const destination = screen.getByLabelText("Mover Um para");
    expect(
      within(destination)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Direto no livro"]);
    await user.click(screen.getByRole("button", { name: "Mover" }));

    await vi.waitFor(() =>
      expect(actions.move).toHaveBeenCalledWith("c1", {
        parentId: null,
        index: 2000,
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Mover Um para")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mover 1.1" }));
    expect(
      within(screen.getByLabelText("Mover 1.1 para"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Prefácio"]);
  });

  it("shows a refused move next to the node", async () => {
    const { user } = renderStructure(NODES, {
      move: vi.fn().mockResolvedValue({ ok: false, errorKey: "rateLimited" }),
    });

    await user.click(screen.getByRole("button", { name: "Descer Prefácio" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Muitas alterações em pouco tempo. Aguarde um minuto e tente de novo.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers a reading state only on leaves", () => {
    renderStructure();

    expect(screen.getByLabelText("Estado de Prefácio")).toHaveValue(
      "not_started",
    );
    expect(screen.getByLabelText("Estado de 1.1")).toBeInTheDocument();
    // Parts and chapters with children derive their state (US-014).
    expect(
      screen.queryByLabelText("Estado de Parte I"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Estado de Um")).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Estado de 1.1"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Não iniciado", "Em andamento", "Concluído"]);
  });

  it("marks a leaf as completed and refreshes the page without reloading it", async () => {
    const { actions, user } = renderStructure();

    await user.selectOptions(
      screen.getByLabelText("Estado de 1.1"),
      "completed",
    );

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(actions.setStatus).toHaveBeenCalledWith("t1", {
      status: "completed",
    });
    expect(
      screen
        .getAllByRole("status")
        .some((status) => status.textContent?.includes("“1.1”: Concluído.")),
    ).toBe(true);
  });

  it("shows the reading dates formatted in pt-BR", () => {
    renderStructure([
      node("c1", null, "chapter", "Um", 0, {
        status: "completed",
        startedAt: "2026-10-01",
        completedAt: "2026-10-05",
      }),
    ]);

    expect(screen.getByText("Início: 1 de out. de 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Conclusão: 5 de out. de 2026"),
    ).toBeInTheDocument();
  });

  it("edits the dates of a completed leaf to log a past reading", async () => {
    const { actions, user } = renderStructure([
      node("c1", null, "chapter", "Um", 0, {
        status: "completed",
        startedAt: "2026-10-01",
        completedAt: "2026-10-05",
      }),
    ]);

    await user.click(
      screen.getByRole("button", { name: "Editar as datas de Um" }),
    );
    const form = screen.getByRole("form", { name: "Datas de Um" });
    expect(within(form).getByLabelText("Início")).toHaveValue("2026-10-01");
    fireEvent.change(within(form).getByLabelText("Início"), {
      target: { value: "2025-01-10" },
    });
    fireEvent.change(within(form).getByLabelText("Conclusão"), {
      target: { value: "2025-02-01" },
    });
    await user.click(
      within(form).getByRole("button", { name: "Salvar datas" }),
    );

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(actions.setDates).toHaveBeenCalledWith("c1", {
      startedAt: "2025-01-10",
      completedAt: "2025-02-01",
    });
  });

  it("offers only the start date for a leaf in progress, and none for one not started", async () => {
    const { actions, user } = renderStructure([
      node("c1", null, "chapter", "Um", 0, {
        status: "in_progress",
        startedAt: "2026-10-01",
      }),
      node("c2", null, "chapter", "Dois", 1),
    ]);

    expect(
      screen.queryByRole("button", { name: "Editar as datas de Dois" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Editar as datas de Um" }),
    );
    const form = screen.getByRole("form", { name: "Datas de Um" });
    expect(within(form).queryByLabelText("Conclusão")).not.toBeInTheDocument();
    await user.click(
      within(form).getByRole("button", { name: "Salvar datas" }),
    );

    await vi.waitFor(() =>
      expect(actions.setDates).toHaveBeenCalledWith("c1", {
        startedAt: "2026-10-01",
        completedAt: "",
      }),
    );
  });

  it("shows a refused date on its field", async () => {
    const { user } = renderStructure(
      [
        node("c1", null, "chapter", "Um", 0, {
          status: "completed",
          startedAt: "2026-10-01",
          completedAt: "2026-10-05",
        }),
      ],
      {
        setDates: vi.fn().mockResolvedValue({
          ok: false,
          errorKey: "datesOutOfOrder",
          field: "completedAt",
        }),
      },
    );

    await user.click(
      screen.getByRole("button", { name: "Editar as datas de Um" }),
    );
    const form = screen.getByRole("form", { name: "Datas de Um" });
    await user.click(
      within(form).getByRole("button", { name: "Salvar datas" }),
    );

    expect(
      await within(form).findByText(
        "A conclusão não pode ser antes do início.",
      ),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Conclusão")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a refused state change", async () => {
    const { user } = renderStructure(NODES, {
      setStatus: vi.fn().mockResolvedValue({ ok: false, errorKey: "notLeaf" }),
    });

    await user.selectOptions(
      screen.getByLabelText("Estado de 1.1"),
      "in_progress",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Só itens sem subitens têm estado próprio; o dos demais vem dos subitens.",
    );
    expect(refresh).not.toHaveBeenCalled();
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
      "Este item não existe mais. Atualize a página.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a parent's state derived from its children, with their dates (US-014)", () => {
    renderStructure([
      node("p1", null, "part", "Parte I", 0, {
        // Stored on the part's row and ignored.
        status: "completed",
        startedAt: "2020-01-01",
        completedAt: "2020-01-02",
      }),
      node("c1", "p1", "chapter", "Um", 0),
      node("t1", "c1", "topic", "1.1", 0, {
        status: "completed",
        startedAt: "2026-10-01",
        completedAt: "2026-10-03",
      }),
      node("t2", "c1", "topic", "1.2", 1, {
        status: "completed",
        startedAt: "2026-10-02",
        completedAt: "2026-10-05",
      }),
      node("c2", "p1", "chapter", "Dois", 1),
    ]);

    const [part, chapter] = screen
      .getAllByRole("listitem")
      .filter((item) =>
        /^(Parte|Capítulo)(Parte I|Um)/.test(item.textContent ?? ""),
      )
      .map((item) => item.firstElementChild?.textContent ?? "");
    expect(chapter).toContain("Concluído");
    expect(chapter).toContain("Início: 1 de out. de 2026");
    expect(chapter).toContain("Conclusão: 5 de out. de 2026");
    expect(part).toContain("Em andamento");
    expect(part).toContain("Início: 1 de out. de 2026");
    expect(part).not.toContain("2020");
    expect(part).toContain("Calculado a partir dos subitens");
    // No control on a parent, and nothing left to complete in "Um".
    expect(
      screen.queryByLabelText("Estado de Parte I"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Concluir tudo em Um" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Concluir tudo em Parte I" }),
    ).toBeInTheDocument();
  });

  it("asks before completing everything under a parent and says how many items change", async () => {
    const { actions, user } = renderStructure();

    await user.click(
      screen.getByRole("button", { name: "Concluir tudo em Parte I" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Concluir tudo em “Parte I”?");
    expect(dialog).toHaveAccessibleDescription(
      "Os 2 itens ainda não concluídos dentro dele serão marcados como concluídos hoje. Os que já estavam em andamento mantêm a data de início.",
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(actions.completeAll).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Concluir tudo em Parte I" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Concluir tudo",
      }),
    );
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(actions.completeAll).toHaveBeenCalledWith("p1");
    expect(screen.getByText("“Parte I”: tudo concluído.")).toHaveClass(
      "sr-only",
    );
  });

  it('shows a refused "complete all" in its dialog', async () => {
    const { user } = renderStructure(NODES, {
      completeAll: vi
        .fn()
        .mockResolvedValue({ ok: false, errorKey: "notParent" }),
    });

    await user.click(
      screen.getByRole("button", { name: "Concluir tudo em Um" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleDescription(
      "Os 2 itens ainda não concluídos dentro dele serão marcados como concluídos hoje. Os que já estavam em andamento mantêm a data de início.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Concluir tudo" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Este item não tem subitens; marque o estado dele diretamente.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
