import type { Page } from "@playwright/test";
import { analyzeCriticalAndSeriousViolations } from "../helpers/axe";

/**
 * Base page object shared by all E2E page objects.
 *
 * Page objects encapsulate selectors and interactions. They should not contain
 * assertions — those belong in the spec files.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string) {
    await this.page.goto(path);
  }

  async waitForNetworkIdle() {
    await this.page.waitForLoadState("networkidle");
  }

  async runAxeCheck() {
    return analyzeCriticalAndSeriousViolations(this.page);
  }
}
