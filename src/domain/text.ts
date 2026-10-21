// Control characters (tabs, line breaks, NUL…) and bidirectional overrides/isolates, which can make
// a title display as something else (security review, US-007). Plain text on one line only.
const HIDDEN_CHARACTERS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

// Whether a title is plain visible text: shared by books (US-007) and their structure (US-010).
export const visibleText = (text: string) => !HIDDEN_CHARACTERS.test(text);
