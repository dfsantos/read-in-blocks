import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTree, type FlatNode } from "@/domain/structure/tree";

import messages from "../../../messages/pt-BR.json";

// next-intl's navigation does not load outside Next.js; a plain anchor keeps the href.
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import { BlocksView } from "./blocks-view";

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
const done = {
  status: "completed",
  startedAt: "2026-10-01",
  completedAt: "2026-10-02",
} as const;

// Prefácio (loose), Parte I (Um (1.1 done, 1.2), Dois), Parte II (empty), Epílogo (loose)
const NODES = [
  node("pre", null, "chapter", "Prefácio", 0, { ...done, goalPages: 4 }),
  node("p1", null, "part", "Parte I", 1),
  node("c1", "p1", "chapter", "<b>Um</b>", 0, { goalPages: 20 }),
  node("t1", "c1", "topic", "1.1", 0, { ...done, goalPages: 10 }),
  node("t2", "c1", "topic", "1.2", 1, { goalPages: 30 }),
  node("c2", "p1", "chapter", "Dois", 1),
  node("p2", null, "part", "Parte II", 2),
  node("epi", null, "chapter", "Epílogo", 3),
];

function renderBlocks(nodes = NODES, noteCounts = {}) {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <BlocksView
        bookId="b-1"
        tree={buildTree(nodes)}
        noteCounts={noteCounts}
      />
    </NextIntlClientProvider>,
  );
}

const group = (name: string) => screen.getByRole("region", { name });

describe("BlocksView", () => {
  afterEach(cleanup);

  it("groups chapters by part, keeping loose chapters where they sit", () => {
    renderBlocks();

    const regions = screen
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-labelledby"));
    expect(regions).toHaveLength(5);
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Fora das partes", "Parte I", "Parte II", "Fora das partes"]);
    expect(
      within(group("Parte I"))
        .getAllByRole("listitem")
        .map((item) => within(item).getAllByRole("link")[0].textContent),
    ).toEqual(["<b>Um</b>", "Dois"]);
    expect(
      within(group("Parte II")).getByText("Nenhum capítulo nesta parte ainda."),
    ).toBeInTheDocument();
    // A part's heading leads to its own page.
    expect(
      within(group("Parte I")).getByRole("link", { name: "Parte I" }),
    ).toHaveAttribute("href", "/books/b-1/nodes/p1");
  });

  it("shows each chapter's state, weighted progress, goal and notes, linking to its notebook", () => {
    renderBlocks(NODES, { c1: 2 });

    const card = within(group("Parte I")).getAllByRole("listitem")[0];
    // User content is text, never markup.
    expect(
      within(card).getByRole("link", { name: "<b>Um</b>" }),
    ).toHaveAttribute("href", "/books/b-1/nodes/c1");
    expect(card).toHaveTextContent("Em andamento");
    // 1.1 (10 pages) of 1.1 + 1.2 (40 pages) is 25%.
    expect(
      within(card).getByRole("progressbar", { name: "Progresso de <b>Um</b>" }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(card).toHaveTextContent("Meta: 20 páginas · 2 anotações");

    const second = within(group("Parte I")).getAllByRole("listitem")[1];
    expect(second).toHaveTextContent("Não iniciado");
    expect(second).toHaveTextContent("Peso padrão");
    expect(second).not.toHaveTextContent("anotaç");

    const preface = screen.getAllByRole("listitem")[0];
    expect(preface).toHaveTextContent("Concluído");
    expect(within(preface).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("invites the reader to build the structure when the book has none", () => {
    renderBlocks([]);

    expect(
      screen.getByText(
        "Os blocos aparecem aqui assim que a estrutura abaixo tiver partes ou capítulos.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
