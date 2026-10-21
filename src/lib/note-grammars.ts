import { common } from "lowlight";

import { DIAGRAM_LANGUAGE, NOTE_LANGUAGES } from "@/domain/notes/rich-text";

// Only the grammars a note's code block may use (plus plain text): fewer regular expressions run
// on the reader's code, in the editor and on the server (security review, US-019).
// A diagram's source (US-022) is registered as a grammar with no rules: the editor shows it as plain
// text instead of guessing a language for it.
export function noteGrammars() {
  return {
    ...Object.fromEntries(
      (["plaintext", ...NOTE_LANGUAGES] as const).map((name) => [
        name,
        common[name],
      ]),
    ),
    [DIAGRAM_LANGUAGE]: () => ({ name: "Mermaid", contains: [] }),
  };
}
