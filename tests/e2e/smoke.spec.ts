import { expect, test } from "@playwright/test";

// The home page needs a session since US-005 (tests/e2e/session.spec.ts); a visitor lands on login.
test("the app renders in pt-BR", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL("/login");
  await expect(
    page.getByRole("heading", { level: 1, name: "Entrar" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page).toHaveTitle("Entrar — Read in Blocks");
});

test("locale redirects never leave the origin", async ({ request }) => {
  for (const path of ["/pt-BR//evil.example", "/pt-BR/%2F%2Fevil.example"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    const location = response.headers()["location"];

    if (location) {
      expect(new URL(location, "http://localhost").hostname).toBe("localhost");
    }
  }
});
