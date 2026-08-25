import { expect, type Page } from "@playwright/test";

export async function loginAs(
  page: Page,
  email: string,
  password: string,
  expectedPath: RegExp,
): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("name.surname@companyname.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(expectedPath, { timeout: 15_000 });
}

export async function dismissOnboardingModals(page: Page): Promise<void> {
  // Welcome / onboarding dialog
  const welcomeSkip = page.getByRole("button", { name: /skip for now/i });
  await expect(welcomeSkip).toBeVisible({ timeout: 3_000 }).catch(() => {
    // Modal may not appear; that's fine.
  });
  if (await welcomeSkip.isVisible().catch(() => false)) {
    await welcomeSkip.click();
    await page.waitForTimeout(500);
  }
}
