import { test as setup } from "@playwright/test";
import { loginAs } from "../helpers/auth.helper";
import { CANARY_AUTH_STATE_PATH } from "../helpers/target.helper";

/**
 * Canary login for a deployed environment (staging, production).
 *
 * Unlike global.setup.ts, this creates, seeds and deletes nothing: it signs in
 * the dedicated canary account and saves its session. The account must be an
 * org Admin (or any in-org role), not a super-admin: ProtectedRoute sends
 * super-admins to /super-admin, so the canary journey could not load.
 */

setup("canary login", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL and E2E_PASSWORD must name the canary account on the target environment",
    );
  }

  await loginAs(page, email, password, /\/(overview)?$/);
  await page.context().storageState({ path: CANARY_AUTH_STATE_PATH });
});
