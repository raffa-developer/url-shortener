import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./utils";

test("forgot password shows a neutral confirmation", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/a reset link is on its way/)).toBeVisible();
});

test("reset password rejects an invalid token", async ({ page }) => {
  await page.goto("/reset-password?token=definitely-not-a-valid-token-1234567890");
  await page.getByLabel("New password", { exact: true }).fill("new-password-123");
  await page.getByLabel("Confirm new password").fill("new-password-123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("This link is invalid or has expired")).toBeVisible();
});

test("verify email rejects an invalid token", async ({ page }) => {
  await page.goto("/verify-email?token=definitely-not-a-valid-token-1234567890");
  await expect(page.getByText("This link is invalid or has expired")).toBeVisible();
});
