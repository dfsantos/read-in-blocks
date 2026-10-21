import { getSchema } from "@tiptap/core";

import type { NoteDoc } from "@/domain/notes/rich-text";
import { noteExtensions } from "@/lib/note-extensions";

// The editor's own ProseMirror schema (US-019): after Zod rebuilt a note from the allowed nodes,
// this checks what Zod cannot, the structure (a list item starts with a paragraph, a heading holds
// only inline content…), so every stored note opens in the editor.
const schema = getSchema(noteExtensions());

export function fitsEditorSchema(content: NoteDoc): boolean {
  try {
    schema.nodeFromJSON(content).check();
    return true;
  } catch {
    return false;
  }
}
