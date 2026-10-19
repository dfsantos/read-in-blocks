import { expect, test } from "@playwright/test";

import { closeTestAuth, E2E_ACCOUNTS, seedSession } from "./auth-helpers";

test.afterAll(closeTestAuth);

test("the login page offers only Google sign-in, in pt-BR", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { level: 1, name: "Entrar" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Entrar — Read in Blocks");
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Entrar com Google" }),
  ).toBeVisible();
});

test("the button starts Google's flow with state and PKCE", async ({
  page,
}) => {
  // Never reach Google: capture the authorization request instead.
  let authorizationURL: URL | undefined;
  await page.route("https://accounts.google.com/**", async (route) => {
    authorizationURL = new URL(route.request().url());
    await route.fulfill({ status: 200, body: "" });
  });
  await page.goto("/login");

  await page.getByRole("button", { name: "Entrar com Google" }).click();

  await expect.poll(() => authorizationURL?.pathname).toContain("/o/oauth2");
  expect(authorizationURL?.searchParams.get("state")).toBeTruthy();
  expect(authorizationURL?.searchParams.get("code_challenge_method")).toBe(
    "S256",
  );
  expect(authorizationURL?.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3000/api/auth/callback/google",
  );
});

test("OAuth errors show a friendly message and never the raw value", async ({
  page,
}) => {
  await page.goto("/login?error=account_not_allowed");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Não foi possível entrar com essa conta.",
  );

  await page.goto("/login?error=access_denied");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "O login foi cancelado. Tente de novo quando quiser.",
  );

  await page.goto("/login?error=%3Cb%3Einjected%3C%2Fb%3E");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Não foi possível concluir o login. Tente de novo em instantes.",
  );
  await expect(page.getByText("injected")).toHaveCount(0);
});

test("a seeded session cookie is accepted by the server", async ({
  context,
  page,
}) => {
  const anonymous = await page.request.get("/api/auth/get-session");
  expect(await anonymous.json()).toBeNull();

  const { cookies, cleanUp } = await seedSession(E2E_ACCOUNTS.login);
  try {
    expect(
      cookies.find((cookie: { name: string }) =>
        cookie.name.endsWith("session_token"),
      ),
    ).toMatchObject({ httpOnly: true });
    await context.addCookies(cookies);

    const signedIn = await page.request.get("/api/auth/get-session");
    expect(signedIn.ok()).toBe(true);
    const body = (await signedIn.json()) as { user: { email: string } };
    expect(body.user.email).toBe(E2E_ACCOUNTS.login);
  } finally {
    await cleanUp();
  }

  // Deleting the user removes its sessions: the same cookie no longer works.
  const revoked = await page.request.get("/api/auth/get-session");
  expect(await revoked.json()).toBeNull();
});
