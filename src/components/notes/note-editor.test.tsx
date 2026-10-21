import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseNoteContent, textToDoc } from "@/domain/notes/rich-text";

import messages from "../../../messages/pt-BR.json";
import NoteEditor from "./note-editor";

// The real Tiptap editor in jsdom: the toolbar's buttons change the document and report it as
// JSON the server accepts. (Pasted HTML: src/lib/note-extensions.test.ts.)

// jsdom does not lay text out; ProseMirror asks for rectangles to scroll the selection into view.
for (const proto of [Range.prototype, Text.prototype] as unknown as {
  getClientRects?: () => DOMRect[];
  getBoundingClientRect?: () => DOMRect;
}[]) {
  proto.getClientRects ??= () => [];
  proto.getBoundingClientRect ??= () => new DOMRect();
}

function renderEditor(initial = "Texto") {
  const onUpdate = vi.fn();
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <NoteEditor
        label="Texto da anotação"
        initialContent={textToDoc(initial)}
        onUpdate={onUpdate}
      />
    </NextIntlClientProvider>,
  );
  return { onUpdate, user: userEvent.setup() };
}

const lastContent = (onUpdate: ReturnType<typeof vi.fn>) =>
  onUpdate.mock.calls.at(-1)?.[0];

async function selectAll() {
  const area = await screen.findByRole("textbox", {
    name: "Texto da anotação",
  });
  area.focus();
  const range = document.createRange();
  range.selectNodeContents(area);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
  return area;
}

describe("NoteEditor", () => {
  afterEach(cleanup);

  it("offers the notebook's formatting in a labeled toolbar", async () => {
    renderEditor();

    const toolbar = await screen.findByRole("toolbar", { name: "Formatação" });
    for (const name of [
      "Negrito (Ctrl+B)",
      "Itálico (Ctrl+I)",
      "Título (Ctrl+Alt+3)",
      "Subtítulo (Ctrl+Alt+4)",
      "Lista com marcadores (Ctrl+Shift+8)",
      "Lista numerada (Ctrl+Shift+7)",
      "Citação (Ctrl+Shift+B)",
      "Código no texto (Ctrl+E)",
      "Bloco de código (Ctrl+Alt+C)",
      "Link",
    ]) {
      expect(toolbar.querySelector(`[aria-label="${name}"]`)).not.toBeNull();
    }
    expect(
      screen.getByRole("textbox", { name: "Texto da anotação" }),
    ).toHaveTextContent("Texto");
  });

  it.each([
    ["Negrito (Ctrl+B)", '"type":"bold"'],
    ["Título (Ctrl+Alt+3)", '"level":3'],
    ["Lista numerada (Ctrl+Shift+7)", '"type":"orderedList"'],
    ["Citação (Ctrl+Shift+B)", '"type":"blockquote"'],
    ["Bloco de código (Ctrl+Alt+C)", '"type":"codeBlock"'],
  ])("applies %s and reports a valid document", async (name, expected) => {
    const { onUpdate, user } = renderEditor();
    await selectAll();

    const button = screen.getByRole("button", { name });
    await user.click(button);

    await waitFor(() =>
      expect(JSON.stringify(lastContent(onUpdate))).toContain(expected),
    );
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(parseNoteContent(lastContent(onUpdate)).ok).toBe(true);
    // Plain objects only: a Server Action drops objects without a prototype (ProseMirror attrs).
    const block = lastContent(onUpdate).content[0];
    expect(Object.getPrototypeOf(block.attrs ?? {})).toBe(Object.prototype);
  });

  it("chooses the language of a code block", async () => {
    const { onUpdate, user } = renderEditor();
    await selectAll();
    await user.click(
      screen.getByRole("button", { name: "Bloco de código (Ctrl+Alt+C)" }),
    );

    await user.selectOptions(
      await screen.findByRole("combobox", {
        name: "Linguagem do bloco de código",
      }),
      "Python",
    );

    await waitFor(() =>
      expect(JSON.stringify(lastContent(onUpdate))).toContain(
        '"language":"python"',
      ),
    );
  });

  it("links the selection to an http(s) address and refuses others", async () => {
    const { onUpdate, user } = renderEditor();
    await selectAll();

    await user.click(screen.getByRole("button", { name: "Link" }));
    const field = screen.getByLabelText("Endereço do link");
    await user.type(field, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Aplicar link" }));
    expect(
      screen.getByText(
        "Use um link completo que comece com http://, https:// ou mailto:.",
      ),
    ).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, "exemplo.com/livro");
    await user.click(screen.getByRole("button", { name: "Aplicar link" }));

    await waitFor(() =>
      expect(JSON.stringify(lastContent(onUpdate))).toContain(
        '"href":"https://exemplo.com/livro"',
      ),
    );
    expect(screen.queryByLabelText("Endereço do link")).toBeNull();
  });
});
