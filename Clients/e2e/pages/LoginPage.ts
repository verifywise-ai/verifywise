import type { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  readonly emailInput = this.page.getByPlaceholder("name.surname@companyname.com");
  readonly passwordInput = this.page.getByPlaceholder("Enter your password");
  readonly signInButton = this.page.getByRole("button", { name: /sign in/i });

  async login(email: string, password: string) {
    await this.goto("/login");
    await this.waitForNetworkIdle();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }
}
