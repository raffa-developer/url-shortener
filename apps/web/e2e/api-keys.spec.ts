import { expect, test } from "@playwright/test";
import { register } from "./utils";

test("a user can create, use and revoke an API key", async ({ page, request }) => {
  await register(page);

  await page.getByRole("link", { name: "API keys" }).click();
  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();

  await page.getByLabel("Key name").fill("E2E key");
  await page.getByRole("button", { name: "Create key" }).click();

  const secretLocator = page.getByTestId("api-key-secret");
  await expect(secretLocator).toBeVisible();
  const secret = ((await secretLocator.textContent()) ?? "").trim();
  expect(secret.startsWith("sk_")).toBe(true);

  // The key authenticates programmatic requests.
  const authorized = await request.get("http://localhost:3000/api/links", {
    headers: { "x-api-key": secret },
  });
  expect(authorized.status()).toBe(200);

  // The key is listed by prefix, and can be revoked.
  const row = page.locator("tbody tr", { hasText: "E2E key" });
  await expect(row).toBeVisible();
  await expect(row).toContainText(secret.slice(0, 11));

  await row.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke key" }).click();
  await expect(row.getByText("Revoked")).toBeVisible();

  // A revoked key is rejected.
  const rejected = await request.get("http://localhost:3000/api/links", {
    headers: { "x-api-key": secret },
  });
  expect(rejected.status()).toBe(401);
});
