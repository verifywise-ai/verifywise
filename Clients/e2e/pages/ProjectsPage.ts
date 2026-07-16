import type { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ProjectsPage extends BasePage {
  readonly addProjectButton = this.page.getByRole("button", { name: /add project/i });
  readonly titleInput = this.page.getByLabel(/project title/i);
  readonly saveButton = this.page.getByRole("button", { name: /save/i });
  readonly projectCards = this.page.locator("[data-testid='project-card']");

  async goto() {
    await super.goto("/projects");
    await this.waitForNetworkIdle();
  }

  async createProject(title: string) {
    await this.addProjectButton.click();
    await this.titleInput.fill(title);
    await this.saveButton.click();
  }
}
