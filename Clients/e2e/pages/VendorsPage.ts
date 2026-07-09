import type { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class VendorsPage extends BasePage {
  readonly addVendorButton = this.page.getByRole("button", { name: /add vendor/i });
  readonly nameInput = this.page.getByLabel(/vendor name/i);
  readonly providesInput = this.page.getByLabel(/vendor provides/i);
  readonly websiteInput = this.page.getByLabel(/website/i);
  readonly contactInput = this.page.getByLabel(/contact person/i);
  readonly saveButton = this.page.getByRole("button", { name: /save/i });
  readonly vendorRows = this.page.getByRole("row");

  async goto() {
    await super.goto("/vendors");
    await this.waitForNetworkIdle();
  }

  async createVendor(data: {
    name: string;
    provides: string;
    website: string;
    contactPerson: string;
  }) {
    await this.addVendorButton.click();
    await this.nameInput.fill(data.name);
    await this.providesInput.fill(data.provides);
    await this.websiteInput.fill(data.website);
    await this.contactInput.fill(data.contactPerson);
    await this.saveButton.click();
  }
}
