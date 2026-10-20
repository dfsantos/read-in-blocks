import { expect, test, type Page } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-028: security headers on the main routes, and the nonce CSP really in force (no violation
// while the pages load and hydrate).
test.afterAll(closeTestAuth);

const STATIC_HEADERS = {
  "strict-transport-security": /^max-age=\d{8,}; includeSubDomains$/,
  "x-content-type-options": /^nosniff$/,
  "referrer-policy": /^strict-origin-when-cross-origin$/,
  "x-frame-options": /^DENY$/,
  "permissions-policy":
    /^(?=.*\bcamera=\(\))(?=.*\bmicrophone=\(\))(?=.*\bgeolocation=\(\))/,
};

function expectStaticHeaders(headers: Record<string, string>) {
  for (const [name, pattern] of Object.entries(STATIC_HEADERS)) {
    expect(headers[name], name).toMatch(pattern);
  }
  expect(headers["x-powered-by"]).toBeUndefined();
}

// A page navigation or an API request: both expose the response headers.
function expectPageHeaders(
  response: { headers(): Record<string, string> } | null,
) {
  const headers = response?.headers() ?? {};
  expectStaticHeaders(headers);
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers["cache-control"]).toMatch(/private/);
  expect(headers["cache-control"]).toMatch(/no-store/);
}

// Collects CSP violations reported by the browser while the page loads and hydrates.
function watchViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test("the login page carries every header and runs under its CSP", async ({
  page,
}) => {
  const violations = watchViolations(page);
  const response = await page.goto("/login");

  expectPageHeaders(response);
  // Hydrated: the sign-in button is interactive only once React's scripts ran with the nonce.
  await expect(
    page.getByRole("button", { name: "Entrar com Google" }),
  ).toBeEnabled();
  await page.waitForLoadState("networkidle");
  expect(violations).toEqual([]);
});

test("the redirect of an anonymous visitor carries the headers too", async ({
  request,
}) => {
  const response = await request.get("/", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expectPageHeaders(response);
});

test("an authenticated page is private and never stored", async ({
  context,
  page,
}) => {
  const seeded = await seedSession(E2E_ACCOUNTS.headers, "Hedy Reader");
  try {
    await context.addCookies(seeded.cookies);
    const violations = watchViolations(page);
    const response = await page.goto("/");

    expect(page.url()).not.toContain("/login");
    expectPageHeaders(response);
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  } finally {
    await seeded.cleanUp();
  }
});

test("API responses carry the headers and a CSP that allows nothing", async ({
  request,
}) => {
  for (const path of ["/api/health", "/api/auth/get-session"]) {
    const response = await request.get(path);
    const headers = response.headers();

    expectStaticHeaders(headers);
    expect(headers["content-security-policy"], path).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(headers["cache-control"], path).toMatch(/no-store/);
  }
});

test("a cross-site write to the auth endpoints is refused", async ({
  request,
}) => {
  const response = await request.post("/api/auth/sign-in/social", {
    headers: { origin: "https://evil.example" },
    data: { provider: "google", callbackURL: "/" },
  });

  expect(response.status()).toBe(403);
});
