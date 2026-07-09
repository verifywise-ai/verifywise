import type { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class DashboardPage extends BasePage {
  readonly projectsLink = this.page.getByRole("link", { name: /projects/i });
  readonly vendorsLink = this.page.getByRole("link", { name: /vendors/i });
  readonly complianceLink = this.page.getByRole("link", { name: /compliance/i });
  readonly fileManagerLink = this.page.getByRole("link", { name: /files/i });
  readonly settingsLink = this.page.getByRole("link", { name: /settings/i });

  async navigateToProjects() {
    await this.projectsLink.click();
  }

  async navigateToVendors() {
    await this.vendorsLink.click();
  }

  async navigateToCompliance() {
    await this.complianceLink.click();
  }

  async navigateToFileManager() {
    await this.fileManagerLink.click();
  }

  async navigateToSettings() {
    await this.settingsLink.click();
  }
}
