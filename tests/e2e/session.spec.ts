import { expect, test, type BrowserContext } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

// US-005: protected routes, return to the original page, the signed-in shell and sign-out.
// Tests that seed share one account, so this file runs serially.
test.describe.configure({ mode: "serial" });
test.afterAll(closeTestAuth);

let cleanUp: (() => Promise<void>) | undefined;

async function signIn(context: BrowserContext) {
  const seeded = await seedSession(E2E_ACCOUNTS.session, "Ada Reader");
  cleanUp = seeded.cleanUp;
  await context.addCookies(seeded.cookies);
}

test.afterEach(async () => {
  await cleanUp?.();
  cleanUp = undefined;
});

test.describe("anonymous visitor", () => {
  test("is sent to the login page from the home page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("heading", { level: 1, name: "Entrar" }),
    ).toBeVisible();
  });

  test("is sent to the login page remembering the page", async ({ page }) => {
    await page.goto("/books/42?tab=notes");

    await expect(page).toHaveURL("/login?next=%2Fbooks%2F42%3Ftab%3Dnotes");
  });

  test("is refused with a forged session cookie", async ({ context, page }) => {
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "forged.value",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/");

    // The proxy lets the cookie through; requireUser() in the layout refuses it.
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
});

test.describe("signed-in reader", () => {
  test("sees the signed-in shell with the user menu", async ({
    context,
    page,
  }) => {
    await signIn(context);
    await page.goto("/");

    await expect(page).toHaveURL("/");
    await expect(page).toHaveTitle("Read in Blocks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Read in Blocks" }),
    ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(nav.getByRole("link", { name: "Biblioteca" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Abrir o menu de Ada Reader" }),
    ).toBeVisible();
  });

  test("opening the login page goes to the library", async ({
    context,
    page,
  }) => {
    await signIn(context);
    await page.goto("/login");

    await expect(page).toHaveURL("/");
  });

  test("opening the login page with a destination goes back there", async ({
    context,
    page,
  }) => {
    await signIn(context);
    await page.goto("/login?next=%2Fbooks%2F42%3Ftab%3Dnotes");

    await expect(page).toHaveURL("/books/42?tab=notes");
  });

  test("an unsafe destination goes to the library instead", async ({
    context,
    page,
  }) => {
    await signIn(context);
    await page.goto("/login?next=%2F%2Fevil.example%2F");
    await expect(page).toHaveURL("/");

    // Dot segments that normalize to `//evil.example` (security review of US-005).
    await page.goto("/login?next=%2F..%2F%2Fevil.example");
    await expect(page).toHaveURL("/");
  });

  test("signing out ends the session", async ({ context, page }) => {
    await signIn(context);
    await page.goto("/");

    await page
      .getByRole("button", { name: "Abrir o menu de Ada Reader" })
      .click();
    await page.getByRole("menuitem", { name: "Sair" }).click();

    await expect(page).toHaveURL("/login");
    const session = await page.request.get("/api/auth/get-session");
    expect(await session.json()).toBeNull();

    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("the shell fits a phone screen", async ({ context, page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(context);
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: "Abrir o menu de Ada Reader" }),
    ).toBeInViewport();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
