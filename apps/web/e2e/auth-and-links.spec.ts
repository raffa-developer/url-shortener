import { expect, test } from "@playwright/test";
import { register } from "./utils";

test("protected pages redirect to the login screen", async ({ page }) => {
  await page.goto("/keys");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("a new user can register, shorten a link and see analytics", async ({
  page,
  request,
}) => {
  await register(page);
  await expect(page.getByRole("heading", { name: "My Links" })).toBeVisible();

  const alias = `e2e${Date.now().toString(36)}`;

  // The header and the empty state both offer "Create URL"; the header is first.
  await page.getByRole("button", { name: "Create URL" }).first().click();
  await page.getByLabel("Destination").fill("https://example.com/e2e-target");
  await page.getByLabel("Custom alias (optional)").fill(alias);
  await page.getByRole("button", { name: "Create link" }).click();

  await expect(
    page.getByRole("dialog").getByText("Short URL created"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.locator("tbody tr", { hasText: `/${alias}` })).toBeVisible();

  // Hit the short link through the API to record a click.
  const redirect = await request.get(`http://localhost:3000/${alias}`, {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(302);

  // Open the analytics page and wait for the worker to record the click.
  await page.locator("tbody tr", { hasText: `/${alias}` }).click();
  await expect(page.getByRole("heading", { name: `/${alias}` })).toBeVisible();

  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("total-clicks")).toHaveText("1");
  }).toPass({ timeout: 20_000 });

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
