// Control characters (tabs, line breaks, NUL…) and bidirectional overrides/isolates, which can make
// a title display as something else (security review, US-007). Plain text on one line only.
const HIDDEN_CHARACTERS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

// Whether a title is plain visible text: shared by books (US-007) and their structure (US-010).
export const visibleText = (text: string) => !HIDDEN_CHARACTERS.test(text);

// The same, but a multi-line text (a node's summary, US-011) may keep its line breaks and tabs.
const HIDDEN_CHARACTERS_MULTILINE =
  /(?![\n\r\t])[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

export const visibleMultilineText = (text: string) =>
  !HIDDEN_CHARACTERS_MULTILINE.test(text);
