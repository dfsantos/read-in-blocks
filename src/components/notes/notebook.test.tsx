import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { plainText, textToDoc, type NoteDoc } from "@/domain/notes/rich-text";

import messages from "../../../messages/pt-BR.json";

const refresh = vi.hoisted(() => vi.fn());
// next-intl's navigation does not load outside Next.js.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));
// The real editor (Tiptap) is covered by note-editor.test.tsx; here a text area stands in for it
// and reports plain-text documents, as the editor reports its JSON.
vi.mock("./note-editor", () => ({
  default: ({
    label,
    initialContent,
    onUpdate,
  }: {
    label: string;
    initialContent?: NoteDoc;
    onUpdate: (content: unknown) => void;
  }) => (
    <textarea
      aria-label={label}
      defaultValue={initialContent ? plainText(initialContent) : ""}
      onChange={(event) =>
        onUpdate(
          event.target.value === ""
            ? { type: "doc", content: [{ type: "paragraph" }] }
            : textToDoc(event.target.value),
        )
      }
    />
  ),
}));

import { Notebook, type NotebookActions, type NotebookNote } from "./notebook";
import { AUTOSAVE_DELAY_MS } from "./use-autosave";

const note = (
  id: string,
  body: string,
  createdAt: string,
  updatedAt = createdAt,
  kind: Pick<NotebookNote, "type" | "reference" | "resolvedAt"> = {
    type: "key_concept",
    reference: null,
    resolvedAt: null,
  },
): NotebookNote => ({
  id,
  content: textToDoc(body),
  view: <p>{body}</p>,
  ...kind,
  createdAt: new Date(createdAt),
  updatedAt: new Date(updatedAt),
});

const NOTES: NotebookNote[] = [
  note("n1", "<script>alert(1)</script> segunda linha", "2026-10-20T13:00:00Z"),
  note("n2", "Ideia revisada", "2026-10-21T12:30:00Z", "2026-10-21T15:45:00Z"),
];

const KINDS: NotebookNote[] = [
  ...NOTES,
  note("n3", "Uma frase marcante", "2026-10-21T13:00:00Z", undefined, {
    type: "quote",
    reference: "p. 42",
    resolvedAt: null,
  }),
  note("n4", "Testar isso", "2026-10-21T14:00:00Z", undefined, {
    type: "action_or_question",
    reference: null,
    resolvedAt: null,
  }),
  note("n5", "Por que assim?", "2026-10-21T14:30:00Z", undefined, {
    type: "action_or_question",
    reference: null,
    resolvedAt: new Date("2026-10-21T16:00:00Z"),
  }),
];

function renderNotebook(
  overrides: Partial<NotebookActions> = {},
  notes: NotebookNote[] = NOTES,
) {
  const actions = {
    create: vi.fn().mockResolvedValue({ ok: true, id: "created" }),
    update: vi.fn().mockResolvedValue({ ok: true }),
    resolve: vi.fn().mockResolvedValue({ ok: true }),
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

async function openComposer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Escrever anotação" }));
  return screen.findByLabelText("Nova anotação");
}

async function openEditor(
  user: ReturnType<typeof userEvent.setup>,
  date: string,
) {
  await user.click(
    screen.getByRole("button", { name: `Editar a anotação de ${date}` }),
  );
  return screen.findByLabelText("Texto da anotação");
}

describe("Notebook", () => {
  beforeEach(() => refresh.mockClear());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("lists the notes in the given (chronological) order, with when they were written and edited", () => {
    renderNotebook();

    const items = within(list()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.getByText("2 anotações")).toBeInTheDocument();
    // The read-only view the page rendered.
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

  it("loads the editor only when the reader starts writing", async () => {
    const { user } = renderNotebook();

    expect(screen.queryByLabelText("Nova anotação")).toBeNull();
    expect(await openComposer(user)).toBeInTheDocument();
  });

  it("adds a note as a document and refreshes the page", async () => {
    const { actions, user } = renderNotebook();

    await user.type(await openComposer(user), "Uma ideia");
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));

    expect(actions.create).toHaveBeenCalledWith({
      content: textToDoc("Uma ideia"),
      type: "key_concept",
    });
    expect(screen.queryByLabelText("Nova anotação")).toBeNull();
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText("Anotação salva.")).toBeInTheDocument();
  });

  it("saves a new note on its own, then keeps updating that same note", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { actions } = renderNotebook({
      create: vi.fn().mockResolvedValue({ ok: true, id: "new-note" }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const field = await openComposer(user);
    fireEvent.change(field, { target: { value: "Rascunho" } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(actions.create).toHaveBeenCalledWith({
      content: textToDoc("Rascunho"),
      type: "key_concept",
    });
    expect(screen.getByText("Salvo")).toBeInTheDocument();
    // Once saved, the draft can no longer be discarded (it is a note now).
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull();

    fireEvent.change(field, { target: { value: "Rascunho final" } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).toHaveBeenCalledWith("new-note", {
      content: textToDoc("Rascunho final"),
      type: "key_concept",
    });
  });

  it("closes an untouched new note without saving", async () => {
    const { actions, user } = renderNotebook();

    await openComposer(user);
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));

    expect(actions.create).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nova anotação")).toBeNull();
  });

  it("refuses an empty note without calling the server", async () => {
    const { actions, user } = renderNotebook();

    const field = await openComposer(user);
    await user.type(field, "a");
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));

    expect(actions.create).not.toHaveBeenCalled();
    expect(
      screen.getByText("Não salvo: Escreva a anotação."),
    ).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    const { user } = renderNotebook({
      create: vi
        .fn()
        .mockResolvedValue({ ok: false, errorKey: "tooManyNotes" }),
    });

    await user.type(await openComposer(user), "Mais uma");
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));

    expect(
      screen.getByText(
        "Não salvo: Este caderno chegou ao limite de 500 anotações.",
      ),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks before leaving the page with an unsaved new note", async () => {
    const { user } = renderNotebook();

    await openComposer(user);
    const untouched = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(untouched);
    expect(untouched.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText("Nova anotação"), "Rascunho");
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });

  it("discards a new note that was not saved yet", async () => {
    const { actions, user } = renderNotebook();

    await user.type(await openComposer(user), "Rascunho");
    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(actions.create).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nova anotação")).toBeNull();
  });

  it("saves an edit on its own a moment after the reader stops typing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { actions } = renderNotebook();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const field = await openEditor(user, "21 de out. de 2026, 09:30");
    fireEvent.change(field, { target: { value: "Ideia" } });
    fireEvent.change(field, { target: { value: "Ideia final" } });
    expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
    expect(actions.update).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));

    // Only the latest content, once.
    expect(actions.update).toHaveBeenCalledTimes(1);
    expect(actions.update).toHaveBeenCalledWith("n2", {
      content: textToDoc("Ideia final"),
      type: "key_concept",
    });
    expect(screen.getByText("Salvo")).toBeInTheDocument();
  });

  it("saves what is left when the reader finishes editing", async () => {
    const { actions, user } = renderNotebook();

    const field = await openEditor(user, "21 de out. de 2026, 09:30");
    await user.clear(field);
    await user.type(field, "Ideia final");
    await user.click(screen.getByRole("button", { name: "Concluir edição" }));

    expect(actions.update).toHaveBeenLastCalledWith("n2", {
      content: textToDoc("Ideia final"),
      type: "key_concept",
    });
    expect(screen.queryByLabelText("Texto da anotação")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("closes an untouched edit without saving", async () => {
    const { actions, user } = renderNotebook();

    await openEditor(user, "20 de out. de 2026, 10:00");
    await user.click(screen.getByRole("button", { name: "Concluir edição" }));

    expect(actions.update).not.toHaveBeenCalled();
    expect(within(list()).getAllByRole("listitem")[0]).toHaveTextContent(
      "segunda linha",
    );
  });

  it("keeps the editor open and says why when the save is refused", async () => {
    const { user } = renderNotebook({
      update: vi.fn().mockResolvedValue({ ok: false, errorKey: "rateLimited" }),
    });

    const field = await openEditor(user, "21 de out. de 2026, 09:30");
    await user.type(field, " mais");
    await user.click(screen.getByRole("button", { name: "Concluir edição" }));

    expect(
      screen.getByText(
        "Não salvo: Muitas alterações em pouco tempo. Aguarde um minuto e tente de novo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Texto da anotação")).toBeInTheDocument();
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });

  it("does not send an emptied note", async () => {
    const { actions, user } = renderNotebook();

    const field = await openEditor(user, "21 de out. de 2026, 09:30");
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Concluir edição" }));

    expect(actions.update).not.toHaveBeenCalled();
    expect(
      screen.getByText("Não salvo: Escreva a anotação."),
    ).toBeInTheDocument();
  });

  it("shows each note's kind with an icon and a label, a quote's reference and a resolution", () => {
    renderNotebook({}, KINDS);

    const items = within(list()).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Conceito-chave");
    expect(items[2]).toHaveTextContent("Citação");
    expect(items[2]).toHaveTextContent("p. 42");
    expect(items[3]).toHaveTextContent("Ação/dúvida");
    expect(items[3]).not.toHaveTextContent("Resolvida");
    expect(items[4]).toHaveTextContent("Resolvida");
    for (const item of items) {
      expect(item.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("filters the notebook by kind, with how many each has", async () => {
    const { user } = renderNotebook({}, KINDS);
    const filter = screen.getByRole("group", { name: "Filtrar por tipo" });

    expect(
      within(filter).getByRole("button", { name: "Todas (5)" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(
      within(filter).getByRole("button", { name: "Ações/dúvidas (2)" }),
    );
    expect(within(list()).getAllByRole("listitem")).toHaveLength(2);
    await user.click(
      within(filter).getByRole("button", { name: "Citações (1)" }),
    );
    expect(within(list()).getAllByRole("listitem")).toHaveLength(1);
    expect(list()).toHaveTextContent("Uma frase marcante");
  });

  it("says when no note has the chosen kind", async () => {
    const { user } = renderNotebook();

    await user.click(screen.getByRole("button", { name: "Citações (0)" }));
    expect(
      screen.getByText("Nenhuma anotação deste tipo."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("writes a quote with its reference", async () => {
    const { actions, user } = renderNotebook();

    const field = await openComposer(user);
    await user.selectOptions(
      screen.getByLabelText("Tipo da anotação"),
      "Citação",
    );
    await user.type(field, "Frase");
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));
    // A quote without its reference is not sent.
    expect(actions.create).not.toHaveBeenCalled();
    expect(
      screen.getByText("Não salvo: Informe a página ou a posição da citação."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Página ou posição")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await user.type(screen.getByLabelText("Página ou posição"), "p. 42");
    await user.click(screen.getByRole("button", { name: "Salvar anotação" }));
    expect(actions.create).toHaveBeenCalledWith({
      content: textToDoc("Frase"),
      type: "quote",
      reference: "p. 42",
    });
  });

  it("changes a note's kind while editing", async () => {
    const { actions, user } = renderNotebook({}, KINDS);

    await openEditor(user, "21 de out. de 2026, 10:00");
    expect(screen.getByLabelText("Tipo da anotação")).toHaveValue("quote");
    expect(screen.getByLabelText("Página ou posição")).toHaveValue("p. 42");
    await user.selectOptions(
      screen.getByLabelText("Tipo da anotação"),
      "Ação/dúvida",
    );
    expect(screen.queryByLabelText("Página ou posição")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Concluir edição" }));

    expect(actions.update).toHaveBeenCalledWith("n3", {
      content: textToDoc("Uma frase marcante"),
      type: "action_or_question",
    });
  });

  it("marks an action or question as resolved and opens it again", async () => {
    const { actions, user } = renderNotebook({}, KINDS);

    await user.click(
      screen.getByRole("button", {
        name: "Marcar como resolvida a anotação de 21 de out. de 2026, 11:00",
      }),
    );
    expect(actions.resolve).toHaveBeenCalledWith("n4", true);
    expect(refresh).toHaveBeenCalled();
    expect(
      screen.getByText("Anotação marcada como resolvida."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Reabrir a anotação de 21 de out. de 2026, 11:30",
      }),
    );
    expect(actions.resolve).toHaveBeenLastCalledWith("n5", false);
    // Only actions and questions can be resolved.
    expect(
      screen.getAllByRole("button", {
        name: /resolvida a anotação|Reabrir a anotação/,
      }),
    ).toHaveLength(2);
  });

  it("shows a refused resolution", async () => {
    const { user } = renderNotebook(
      {
        resolve: vi
          .fn()
          .mockResolvedValue({ ok: false, errorKey: "rateLimited" }),
      },
      KINDS,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Marcar como resolvida a anotação de 21 de out. de 2026, 11:00",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Muitas alterações em pouco tempo.",
    );
    expect(refresh).not.toHaveBeenCalled();
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
