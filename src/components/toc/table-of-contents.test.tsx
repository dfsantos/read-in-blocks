import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadingActions } from "@/components/structure/reading-controls";
import type { FlatNode } from "@/domain/structure/tree";

import messages from "../../../messages/pt-BR.json";

const refresh = vi.hoisted(() => vi.fn());
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ refresh }),
}));

import { TableOfContents } from "./table-of-contents";

const node = (
  id: string,
  parentId: string | null,
  kind: FlatNode["kind"],
  title: string,
  position: number,
  details: Partial<FlatNode> = {},
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

// Prefácio, Parte I (Um (1.1, 1.2), Dois), Parte II (empty part is a leaf)
const NODES: FlatNode[] = [
  node("pre", null, "chapter", "Prefácio", 0, {
    status: "completed",
    startedAt: "2026-10-01",
    completedAt: "2026-10-02",
  }),
  node("p1", null, "part", "Parte I", 1),
  node("c1", "p1", "chapter", "Um", 0, {
    summary: "Sobre o começo.",
    goalPages: 12,
  }),
  node("t1", "c1", "topic", "1.1", 0),
  node("t2", "c1", "topic", "1.2", 1, {
    status: "completed",
    startedAt: "2026-10-03",
    completedAt: "2026-10-04",
  }),
  node("c2", "p1", "chapter", "Dois", 1),
];

let books = 0;

function renderToc(
  overrides: Partial<ReadingActions> = {},
  {
    bookId = `book-${++books}`,
    nodes = NODES,
    noteCounts = {} as Record<string, number>,
  } = {},
) {
  const actions = {
    setStatus: vi.fn().mockResolvedValue({ ok: true }),
    setDates: vi.fn().mockResolvedValue({ ok: true }),
    completeAll: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { completed: 2 } }),
    ...overrides,
  };
  const view = (list: FlatNode[]) => (
    <NextIntlClientProvider
      locale="pt-BR"
      messages={messages}
      timeZone="America/Sao_Paulo"
    >
      <TableOfContents
        bookId={bookId}
        nodes={list}
        noteCounts={noteCounts}
        actions={actions}
      />
    </NextIntlClientProvider>
  );
  const result = render(view(nodes));
  return {
    actions,
    bookId,
    user: userEvent.setup(),
    rerender: (list: FlatNode[]) => result.rerender(view(list)),
    unmount: result.unmount,
  };
}

const item = (name: string) =>
  screen.getByRole("treeitem", { name: new RegExp(`^${name} `) });

describe("TableOfContents", () => {
  beforeEach(() => refresh.mockClear());
  afterEach(cleanup);

  it("shows the structure as a tree, with each node's state and its section's progress", () => {
    renderToc();

    const tree = screen.getByRole("tree", { name: "Sumário do livro" });
    const roots = within(tree)
      .getAllByRole("treeitem")
      .filter((element) => element.getAttribute("aria-level") === "1");
    expect(
      roots.map((element) => element.getAttribute("aria-posinset")),
    ).toEqual(["1", "2"]);
    expect(item("Prefácio")).toHaveAccessibleName("Prefácio Concluído");
    expect(item("Prefácio")).not.toHaveAttribute("aria-expanded");
    // Parents show the state derived from their children (US-014) and how many leaves are done.
    expect(item("Parte I")).toHaveAccessibleName(
      "Parte I Em andamento · 1 de 3 concluídos",
    );
    expect(item("Parte I")).toHaveAttribute("aria-expanded", "true");
    expect(item("Um")).toHaveAccessibleName(
      "Um Em andamento · 1 de 2 concluídos",
    );
    expect(item("Um")).toHaveAttribute("aria-level", "2");
    expect(item("1.1")).toHaveAttribute("aria-level", "3");
    expect(item("1.1")).toHaveAttribute("aria-setsize", "2");
  });

  it("shows how many notes each node's notebook holds, and opens it from the details", async () => {
    const { user, bookId } = renderToc({}, { noteCounts: { c1: 2, t1: 1 } });

    expect(item("Um")).toHaveAccessibleName(
      "Um Em andamento · 1 de 2 concluídos · 2 anotações",
    );
    expect(item("1.1")).toHaveAccessibleName("1.1 Não iniciado · 1 anotação");
    // No count on a node without notes.
    expect(item("Dois")).toHaveAccessibleName("Dois Não iniciado");

    await user.click(item("Um"));
    const details = screen.getByRole("complementary", { name: "Um" });
    expect(within(details).getByText("2 anotações")).toBeInTheDocument();
    expect(
      within(details).getByRole("link", { name: "Abrir caderno" }),
    ).toHaveAttribute("href", `/books/${bookId}/nodes/c1`);

    await user.click(item("Dois"));
    expect(
      within(screen.getByRole("complementary", { name: "Dois" })).getByText(
        "sem anotações",
      ),
    ).toBeInTheDocument();
  });

  it("invites the reader to build the structure when the book has none", () => {
    renderToc({}, { nodes: [] });

    expect(
      screen.getByText(
        "O sumário aparece aqui assim que a estrutura abaixo tiver partes ou capítulos.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });

  it("collapses and expands one node, and all of them", async () => {
    const { user } = renderToc();

    await user.click(item("Um").querySelector("[aria-hidden]")!);
    expect(item("Um")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: /^1\.1 / })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Recolher tudo" }));
    expect(item("Parte I")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: /^Um / })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Expandir tudo" }));
    expect(item("Parte I")).toHaveAttribute("aria-expanded", "true");
    expect(item("1.1")).toBeInTheDocument();
  });

  it("moves through the tree with the keyboard, one tab stop at a time", async () => {
    const { user } = renderToc();

    // After "Expandir tudo" and "Recolher tudo", the tree is a single tab stop.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(item("Prefácio")).toHaveFocus();
    expect(
      screen
        .getAllByRole("treeitem")
        .filter((element) => element.tabIndex === 0),
    ).toHaveLength(1);

    await user.keyboard("{ArrowDown}");
    expect(item("Parte I")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(item("Um")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(item("Um")).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{ArrowDown}");
    expect(item("Dois")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(item("Parte I")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(item("Parte I")).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{ArrowRight}");
    expect(item("Parte I")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{End}");
    expect(item("Dois")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(item("Prefácio")).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(item("Prefácio")).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("complementary", { name: "Prefácio" }),
    ).toBeInTheDocument();
  });

  it("opens a node's details: summary, goal and state", async () => {
    const { user } = renderToc();

    expect(
      screen.getByText(
        "Escolha um item do sumário para ver o resumo, a meta e o estado.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Um"));

    const details = screen.getByRole("complementary", { name: "Um" });
    expect(details).toHaveTextContent("Capítulo");
    expect(details).toHaveTextContent("Sobre o começo.");
    expect(details).toHaveTextContent("12 páginas");
    expect(details).toHaveTextContent("Em andamento");
    expect(
      within(details).getByRole("button", { name: "Concluir tudo em Um" }),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Dois"));
    const leaf = screen.getByRole("complementary", { name: "Dois" });
    expect(leaf).toHaveTextContent("Sem resumo.");
    expect(leaf).toHaveTextContent("Peso padrão");
    expect(within(leaf).getByLabelText("Estado de Dois")).toHaveValue(
      "not_started",
    );
  });

  it("updates the ancestors as soon as a leaf changes, before the server answers", async () => {
    let answer: (value: { ok: true }) => void = () => {};
    const setStatus = vi.fn(
      () => new Promise<{ ok: true }>((resolve) => (answer = resolve)),
    );
    const { user, rerender } = renderToc({ setStatus });

    await user.click(screen.getByText("1.1"));
    await user.selectOptions(
      screen.getByLabelText("Estado de 1.1"),
      "completed",
    );

    // Still waiting for the server: the chapter is already completed, the part follows.
    expect(setStatus).toHaveBeenCalledWith("t1", { status: "completed" });
    expect(item("Um")).toHaveAccessibleName("Um Concluído · 2 de 2 concluídos");
    expect(item("Parte I")).toHaveAccessibleName(
      "Parte I Em andamento · 2 de 3 concluídos",
    );

    answer({ ok: true });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    // The refreshed data from the server takes over.
    rerender(
      NODES.map((each) =>
        each.id === "t1"
          ? {
              ...each,
              status: "completed",
              startedAt: "2026-10-20",
              completedAt: "2026-10-20",
            }
          : each,
      ),
    );
    expect(item("Um")).toHaveAccessibleName("Um Concluído · 2 de 2 concluídos");
  });

  it("undoes the change when the server refuses it", async () => {
    const { user } = renderToc({
      setStatus: vi.fn().mockResolvedValue({ ok: false, errorKey: "notFound" }),
    });

    await user.click(screen.getByText("1.1"));
    await user.selectOptions(
      screen.getByLabelText("Estado de 1.1"),
      "completed",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este item não existe mais. Recarregue a página.",
    );
    expect(item("Um")).toHaveAccessibleName(
      "Um Em andamento · 1 de 2 concluídos",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("completes a whole part from its details, at once in the tree", async () => {
    const { actions, user } = renderToc();

    await user.click(screen.getByText("Parte I"));
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
    expect(item("Parte I")).toHaveAccessibleName(
      "Parte I Concluído · 3 de 3 concluídos",
    );
  });

  it("keeps what was collapsed during the session, per book", async () => {
    const first = renderToc();
    await first.user.click(item("Um").querySelector("[aria-hidden]")!);
    first.unmount();

    // The same book again (a reload): still collapsed.
    renderToc({}, { bookId: first.bookId });
    expect(item("Um")).toHaveAttribute("aria-expanded", "false");
    expect(
      sessionStorage.getItem(`read-in-blocks:toc-collapsed:${first.bookId}`),
    ).toBe('["c1"]');
    cleanup();

    // Another book starts expanded.
    renderToc();
    expect(item("Um")).toHaveAttribute("aria-expanded", "true");
  });
});
