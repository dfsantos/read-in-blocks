import type { Extensions, NodeViewRenderer } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import StarterKit from "@tiptap/starter-kit";
import { createLowlight } from "lowlight";

import { noteGrammars } from "@/lib/note-grammars";

import { isSafeHref, NOTE_HEADING_LEVELS } from "@/domain/notes/rich-text";

// The Tiptap extensions of a note (US-019, ADR-0007): exactly the nodes and marks that
// src/domain/notes/rich-text.ts accepts. The editor uses them, and the server builds the same
// ProseMirror schema from them to check a document's structure before storing it.

// Highlights code blocks in the editor; the read-only view highlights on the server with its own.
export const noteLowlight = createLowlight(noteGrammars());

// The editor draws code blocks with its own view (a diagram's preview, US-022); the server only
// needs the schema.
export function noteExtensions(
  options: Readonly<{ codeBlockView?: NodeViewRenderer }> = {},
): Extensions {
  const { codeBlockView } = options;
  const codeBlock = codeBlockView
    ? CodeBlockLowlight.extend({ addNodeView: () => codeBlockView })
    : CodeBlockLowlight;
  return [
    StarterKit.configure({
      heading: { levels: [...NOTE_HEADING_LEVELS] },
      // Not offered by the notebook (the domain schema refuses them).
      strike: false,
      underline: false,
      horizontalRule: false,
      // Replaced by the highlighted code block below (same node name and attributes).
      codeBlock: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        // Pasted, typed or autolinked: only http(s) and mailto, like the server.
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      },
    }),
    codeBlock.configure({
      lowlight: noteLowlight,
      defaultLanguage: "plaintext",
    }),
  ];
}
