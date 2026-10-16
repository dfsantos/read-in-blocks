import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Read in Blocks" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page).toHaveTitle("Read in Blocks");
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
