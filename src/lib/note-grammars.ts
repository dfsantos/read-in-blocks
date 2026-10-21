import { common } from "lowlight";

import { NOTE_LANGUAGES } from "@/domain/notes/rich-text";

// Only the grammars a note's code block may use (plus plain text): fewer regular expressions run
// on the reader's code, in the editor and on the server (security review, US-019).
export function noteGrammars() {
  return Object.fromEntries(
    (["plaintext", ...NOTE_LANGUAGES] as const).map((name) => [
      name,
      common[name],
    ]),
  );
}
