"use client";

import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

import { NoteDiagram } from "@/components/notes/note-diagram";
import { DIAGRAM_LANGUAGE } from "@/domain/notes/rich-text";

// A code block in the editor (US-019, US-022): the highlighted code the reader edits and, for a
// diagram, its preview right below, redrawn shortly after typing stops. A plain ProseMirror node
// view, so the editable <code> is ProseMirror's alone and exists as soon as the block does; only
// the preview, which is not editable and not part of the note, is drawn by React.

export type CodeBlockViewContext = Readonly<
  Pick<
    ComponentProps<typeof NextIntlClientProvider>,
    "locale" | "messages" | "timeZone"
  >
>;

const languageOf = (node: ProseMirrorNode): string | null =>
  typeof node.attrs.language === "string" ? node.attrs.language : null;

export function codeBlockView(context: CodeBlockViewContext): NodeViewRenderer {
  return ({ node: initial }) => {
    let node = initial;
    const diagram = languageOf(node) === DIAGRAM_LANGUAGE;

    const dom = document.createElement("div");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.append(code);
    dom.append(pre);

    const setLanguage = (language: string | null) => {
      if (language) {
        pre.dataset.language = language;
        code.className = `language-${language}`;
      } else {
        delete pre.dataset.language;
        code.removeAttribute("class");
      }
    };
    setLanguage(languageOf(node));

    let preview: HTMLElement | null = null;
    let root: Root | null = null;
    const drawPreview = () =>
      root?.render(
        <NextIntlClientProvider
          locale={context.locale}
          messages={context.messages}
          timeZone={context.timeZone}
        >
          <NoteDiagram source={node.textContent} delay={400} />
        </NextIntlClientProvider>,
      );
    if (diagram) {
      preview = document.createElement("div");
      preview.contentEditable = "false";
      preview.className = "mt-2 select-none";
      dom.append(preview);
      root = createRoot(preview);
      drawPreview();
    }

    return {
      dom,
      contentDOM: code,
      update: (updated) => {
        // Becoming or ceasing to be a diagram rebuilds the view.
        if (
          updated.type !== node.type ||
          (languageOf(updated) === DIAGRAM_LANGUAGE) !== diagram
        ) {
          return false;
        }
        node = updated;
        setLanguage(languageOf(node));
        drawPreview();
        return true;
      },
      // The preview is React's: ProseMirror neither reads its changes nor handles its events.
      ignoreMutation: (mutation) =>
        preview !== null &&
        mutation.type !== "selection" &&
        preview.contains(mutation.target),
      stopEvent: (event) =>
        preview !== null &&
        event.target instanceof Node &&
        preview.contains(event.target),
      destroy: () => {
        const mounted = root;
        root = null;
        // Unmounting while React renders is not allowed; the editor may destroy views mid-render.
        if (mounted) queueMicrotask(() => mounted.unmount());
      },
    };
  };
}
