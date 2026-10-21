import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/pt-BR.json";

const refresh = vi.hoisted(() => vi.fn());
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { Notebook, type NotebookActions, type NotebookNote } from "./notebook";

const NOTES: NotebookNote[] = [
  {
    id: "n1",
    body: "<script>alert(1)</script>\nsegunda linha",
    createdAt: new Date("2026-10-20T13:00:00Z"),
    updatedAt: new Date("2026-10-20T13:00:00Z"),
  },
  {
    id: "n2",
    body: "Ideia revisada",
    createdAt: new Date("2026-10-21T12:30:00Z"),
    updatedAt: new Date("2026-10-21T15:45:00Z"),
  },
];

function renderNotebook(
  overrides: Partial<NotebookActions> = {},
  notes: NotebookNote[] = NOTES,
) {
  const actions = {
    create: vi.fn().mockResolvedValue({ ok: true }),
    update: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
  render(
    <NextIntlClientProvider
      locale="pt-BR"
      messages={messages}
      timeZone="America/Sao_Paulo"
    >
      <Notebook title="Capítulo 1" notes={notes} actions={actions} />
    </NextIntlClientProvider>,
  );
  return { actions, user: userEvent.setup() };
}

const list = () =>
  screen.getByRole("list", { name: "Anotações de Capítulo 1" });

describe("Notebook", () => {
  beforeEach(() => refresh.mockClear());
  afterEach(cleanup);

  it("lists the notes in the given (chronological) order, with when they were written and edited", () => {
    renderNotebook();

    const items = within(list()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.getByText("2 anotações")).toBeInTheDocument();
    // User content is text, never markup.
    expect(items[0]).toHaveTextContent("<script>alert(1)</script>");
    expect(items[0]).toHaveTextContent("Criada em 20 de out. de 2026, 10:00");
    expect(items[0]).not.toHaveTextContent("editada");
    expect(items[1]).toHaveTextContent("Criada em 21 de out. de 2026, 09:30");
    expect(items[1]).toHaveTextContent("editada em 21 de out. de 2026, 12:45");
  });

  it("invites the reader to write when the notebook is empty", () => {
    renderNotebook({}, []);

    expect(screen.getByText("Nenhuma anotação")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nenhuma anotação ainda. Escreva abaixo o que você quer guardar deste trecho.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("adds a note and refreshes the page", async () => {
    const { actions, user } = renderNotebook();

    const field = screen.getByLabelText("Nova anotação");
    await user.type(field, "  Uma ideia  ");
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));

    expect(actions.create).toHaveBeenCalledWith({ body: "  Uma ideia  " });
    expect(field).toHaveValue("");
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Anotação salva.");
  });

  it("refuses an empty note without calling the server", async () => {
    const { actions, user } = renderNotebook();

    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));

    expect(actions.create).not.toHaveBeenCalled();
    expect(screen.getByText("Escreva a anotação.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nova anotação")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows the server's refusal", async () => {
    const { user } = renderNotebook({
      create: vi
        .fn()
        .mockResolvedValue({ ok: false, errorKey: "tooManyNotes" }),
    });

    await user.type(screen.getByLabelText("Nova anotação"), "Mais uma");
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));

    expect(
      screen.getByText("Este caderno chegou ao limite de 500 anotações."),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("edits a note in place", async () => {
    const { actions, user } = renderNotebook();

    await user.click(
      screen.getByRole("button", {
        name: "Editar a anotação de 21 de out. de 2026, 09:30",
      }),
    );
    const field = screen.getByLabelText("Texto da anotação");
    await user.clear(field);
    await user.type(field, "Ideia final");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(actions.update).toHaveBeenCalledWith("n2", { body: "Ideia final" });
    expect(screen.queryByLabelText("Texto da anotação")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("cancels an edit without saving", async () => {
    const { actions, user } = renderNotebook();

    await user.click(
      screen.getByRole("button", {
        name: "Editar a anotação de 20 de out. de 2026, 10:00",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(actions.update).not.toHaveBeenCalled();
    expect(within(list()).getAllByRole("listitem")[0]).toHaveTextContent(
      "segunda linha",
    );
  });

  it("deletes a note only after confirmation", async () => {
    const { actions, user } = renderNotebook();

    await user.click(
      screen.getByRole("button", {
        name: "Excluir a anotação de 20 de out. de 2026, 10:00",
      }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Excluir esta anotação?",
    });
    expect(actions.remove).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Excluir anotação" }),
    );
    expect(actions.remove).toHaveBeenCalledWith("n1");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the note when the deletion is cancelled", async () => {
    const { actions, user } = renderNotebook();

    await user.click(
      screen.getByRole("button", {
        name: "Excluir a anotação de 20 de out. de 2026, 10:00",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(actions.remove).not.toHaveBeenCalled();
  });
});
