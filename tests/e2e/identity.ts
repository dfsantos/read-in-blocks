// The only accounts E2E tests sign in as, one per spec file so parallel files never share a user.
// The `.test` domain cannot be a real Google account, and only the server Playwright starts allows
// these e-mails (playwright.config.ts).
export const E2E_ACCOUNTS = {
  login: "e2e-login@example.test",
  session: "e2e-session@example.test",
  headers: "e2e-headers@example.test",
  books: "e2e-books@example.test",
  booksIntruder: "e2e-books-intruder@example.test",
} as const;

export const E2E_ALLOWLIST = Object.values(E2E_ACCOUNTS).join(",");
