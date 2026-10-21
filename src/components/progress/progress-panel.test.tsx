import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import { buildTree, type FlatNode } from "@/domain/structure/tree";

import messages from "../../../messages/pt-BR.json";

import { ProgressPanel } from "./progress-panel";

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

const completed = {
  status: "completed",
  startedAt: "2026-10-01",
  completedAt: "2026-10-02",
} as const;

function renderPanel(nodes: FlatNode[], today = "2026-10-21") {
  render(
    <NextIntlClientProvider
      locale="pt-BR"
      messages={messages}
      timeZone="America/Sao_Paulo"
    >
      <ProgressPanel tree={buildTree(nodes)} today={today} />
    </NextIntlClientProvider>,
  );
}

const bar = (name: string) => screen.getByRole("progressbar", { name });

describe("ProgressPanel", () => {
  afterEach(cleanup);

  it("guides the reader when the book has no structure", () => {
    renderPanel([]);

    expect(
      screen.getByText(
        "Monte a estrutura do livro abaixo para acompanhar o progresso: cada parte e capítulo concluído aparece aqui.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("moves the book 40% when a part of 40% is completed (PRD §6.2)", () => {
    renderPanel([
      node("p1", null, "part", "Fundamentos", 0, { goalPages: 40 }),
      node("c1", "p1", "chapter", "Um", 0, completed),
      node("c2", "p1", "chapter", "Dois", 1, completed),
      node("p2", null, "part", "Prática", 1, { goalPages: 60 }),
      node("c3", "p2", "chapter", "Três", 0),
      node("c4", "p2", "chapter", "Quatro", 1, {
        status: "in_progress",
        startedAt: "2026-10-03",
      }),
    ]);

    const overall = bar("Progresso do livro");
    expect(overall).toHaveAttribute("aria-valuenow", "40");
    expect(overall).toHaveAttribute("aria-valuemin", "0");
    expect(overall).toHaveAttribute("aria-valuemax", "100");
    expect(overall).toHaveAttribute("aria-valuetext", "40%");
    expect(screen.getByText("40%", { selector: ".text-3xl" })).toBeVisible();
    // By part and chapter; a chapter in progress counts as 0% (D-03).
    expect(bar("Progresso de Fundamentos")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(bar("Progresso de Prática")).toHaveAttribute("aria-valuenow", "0");
    expect(bar("Progresso de Quatro")).toHaveAttribute("aria-valuenow", "0");
    // The plain count, apart from the weighted percentage.
    expect(screen.getByText("2 de 4 capítulos concluídos")).toBeInTheDocument();
    // The chapters have no goal, so they weigh the same within each part: the panel says so.
    expect(screen.getByRole("note")).toHaveTextContent(
      "4 itens sem meta usam o peso padrão",
    );
  });

  it("warns, discreetly, when nodes without goal take the default weight", () => {
    renderPanel([
      node("c1", null, "chapter", "Um", 0, { goalPages: 10, ...completed }),
      node("c2", null, "chapter", "Dois", 1),
    ]);

    expect(screen.getByRole("note")).toHaveTextContent(
      "1 item sem meta usa o peso padrão (a média das metas ao lado), o que pode distorcer o percentual.",
    );
    // Dois takes the mean of the goals next to it (10): 50%.
    expect(bar("Progresso do livro")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("1 de 2 capítulos concluídos")).toBeInTheDocument();
  });

  it("says nothing about default weights when every goal is set", () => {
    renderPanel([
      node("c1", null, "chapter", "Um", 0, { goalPages: 30, ...completed }),
      node("c2", null, "chapter", "Dois", 1, { goalPages: 70 }),
    ]);

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(bar("Progresso do livro")).toHaveAttribute("aria-valuenow", "30");
  });

  it("only shows 100% when everything is completed, and titles as text", () => {
    renderPanel([
      node("c1", null, "chapter", "<b>Um</b>", 0, {
        goalPages: 999,
        ...completed,
      }),
      node("c2", null, "chapter", "Dois", 1, { goalPages: 1 }),
    ]);

    // 99.9% rounds down.
    expect(bar("Progresso do livro")).toHaveAttribute("aria-valuenow", "99");
    const sections = screen.getByRole("list", {
      name: "Progresso por parte e capítulo",
    });
    expect(within(sections).getByText("<b>Um</b>")).toBeInTheDocument();
  });

  describe("pace and expected finish (US-023)", () => {
    const doneOn = (day: string) =>
      ({ status: "completed", startedAt: day, completedAt: day }) as const;
    const pace = () =>
      screen.queryByRole("region", { name: "Ritmo e previsão" });

    it("forecasts the finish from the recent weighted pace", () => {
      renderPanel([
        node("a", null, "chapter", "A", 0, doneOn("2026-10-15")),
        node("b", null, "chapter", "B", 1, doneOn("2026-10-21")),
        node("c", null, "chapter", "C", 2),
        node("d", null, "chapter", "D", 3),
      ]);

      expect(pace()).toHaveTextContent(
        "Previsão de conclusão: 28 de outubro de 2026",
      );
      expect(pace()).toHaveTextContent(
        "Ritmo: 50% do livro por semana (2 itens concluídos nos últimos 7 dias).",
      );
    });

    it("explains instead of forecasting without enough data", () => {
      renderPanel([
        node("a", null, "chapter", "A", 0, doneOn("2026-10-20")),
        node("b", null, "chapter", "B", 1),
      ]);

      expect(pace()).toHaveTextContent(
        "Ainda não há dados para prever a conclusão",
      );
      expect(pace()).toHaveTextContent(
        "Até agora: 1 conclusão nas últimas 4 semanas.",
      );
      expect(pace()).not.toHaveTextContent("Previsão de conclusão");
    });

    it("shows no forecast for a finished book", () => {
      renderPanel([
        node("a", null, "chapter", "A", 0, doneOn("2026-10-01")),
        node("b", null, "chapter", "B", 1, doneOn("2026-10-20")),
      ]);

      expect(bar("Progresso do livro")).toHaveAttribute("aria-valuenow", "100");
      expect(pace()).toBeNull();
    });
  });
});
