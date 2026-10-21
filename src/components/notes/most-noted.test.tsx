import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTree, type FlatNode } from "@/domain/structure/tree";

import messages from "../../../messages/pt-BR.json";

// next-intl's navigation does not load outside Next.js; a plain anchor keeps the href.
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import { MostNoted } from "./most-noted";

const node = (
  id: string,
  parentId: string | null,
  kind: FlatNode["kind"],
  title: string,
  position: number,
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
});

const NODES = [
  node("pre", null, "chapter", "Prefácio", 0),
  node("p1", null, "part", "Parte I", 1),
  node("c1", "p1", "chapter", "<b>Um</b>", 0),
  node("t1", "c1", "topic", "1.1", 0),
  ...Array.from({ length: 6 }, (_, i) =>
    node(`x${i}`, "p1", "chapter", `Extra ${i}`, i + 1),
  ),
];

function renderPanel(nodes: FlatNode[], noteCounts: Record<string, number>) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <MostNoted bookId="b-1" tree={buildTree(nodes)} noteCounts={noteCounts} />
    </NextIntlClientProvider>,
  );
}

describe("MostNoted", () => {
  afterEach(cleanup);

  it("lists the five most noted chapters, most first, each leading to its notebook", () => {
    renderPanel(NODES, {
      pre: 1,
      c1: 1,
      t1: 5,
      x0: 2,
      x1: 2,
      x2: 3,
      x3: 1,
      x4: 1,
    });

    const items = within(
      screen.getByRole("list", {
        name: "Capítulos com mais anotações, do mais anotado ao menos",
      }),
    ).getAllByRole("listitem");
    // Um counts its topic's notes; ties keep reading order; only five.
    expect(items.map((item) => item.textContent)).toEqual([
      "<b>Um</b>Muitas anotações: 6 anotações",
      "Extra 2Algumas anotações: 3 anotações",
      "Extra 0Poucas anotações: 2 anotações",
      "Extra 1Poucas anotações: 2 anotações",
      "PrefácioPoucas anotações: 1 anotação",
    ]);
    // User content is text, never markup.
    expect(
      within(items[0]).getByRole("link", { name: "<b>Um</b>" }),
    ).toHaveAttribute("href", "/books/b-1/nodes/c1");
  });

  it("says when nothing was noted yet", () => {
    renderPanel(NODES, {});

    expect(
      screen.getByText(
        "Nenhuma anotação ainda. Os capítulos em que você mais anotar aparecem aqui.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows nothing for a book without chapters", () => {
    const { container } = renderPanel([node("p", null, "part", "P", 0)], {
      p: 2,
    });

    expect(container).toBeEmptyDOMElement();
  });
});
