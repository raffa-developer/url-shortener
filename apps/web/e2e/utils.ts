import { expect, type Page } from "@playwright/test";

export const E2E_PASSWORD = "e2e-password-123";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3000";

export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

/**
 * Playwright only waits for the dashboard port; the API boots concurrently via
 * `npm run dev:all`, so wait for its health endpoint before making requests.
 */
async function waitForApiReady(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(`${API_URL}/health`);
          return response.ok();
        } catch {
          return false;
        }
      },
      { timeout: 60_000, intervals: [500] },
    )
    .toBe(true);
}

export async function register(
  page: Page,
  email: string = uniqueEmail(),
): Promise<string> {
  await waitForApiReady(page);
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Confirm password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}
