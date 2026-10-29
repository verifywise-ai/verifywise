import fs from "fs";
import path from "path";
import { brand } from "../../../shared/design-tokens/palette";
import {
  applyColorTokens,
  colorTokenRoot,
  emailColorTokens,
  emailCssVariables,
} from "../../tools/emailColors";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";

describe("email color tokens", () => {
  it("reads the shared brand primary", () => {
    expect(emailColorTokens.colorBrandPrimary).toBe(brand.primary);
  });

  it("sets the report CSS variables from the shared palette", () => {
    expect(emailCssVariables["--color-background"]).toBe(emailColorTokens.colorBackground);
    expect(emailCssVariables["--color-primary"]).toBe(brand.primary);

    const css = colorTokenRoot();
    expect(css).toContain(`--color-background: ${emailColorTokens.colorBackground}`);
    expect(css).toContain(`--color-primary: ${brand.primary}`);
  });

  it("uses a hex brand override and ignores anything else", () => {
    expect(colorTokenRoot("#112233")).toContain("--color-primary: #112233");

    const rejected = colorTokenRoot("red; } body { background: url(evil)");
    expect(rejected).toContain(`--color-primary: ${brand.primary}`);
    expect(rejected).not.toContain("evil");
  });

  it("substitutes a color placeholder and leaves other placeholders", () => {
    const html = applyColorTokens('<a style="color: {{colorBrandPrimary}}">{{heading}}</a>');
    expect(html).toBe(`<a style="color: ${brand.primary}">{{heading}}</a>`);
  });

  it("substitutes palette colors in the approval requested email", async () => {
    const mjml = fs.readFileSync(
      path.join(__dirname, "../../templates/approval-requested.mjml"),
      "utf-8",
    );
    const html = await compileMjmlToHtml(mjml, {
      step_number: "1",
      approver_name: "Ada",
      use_case_name: "Hiring assistant",
      requester_name: "Grace",
      workflow_name: "Launch",
      total_steps: "3",
      approval_url: "https://example.com/approve",
    });

    expect(mjml).not.toMatch(/#13715b/i);
    expect(html).toContain(brand.primary);
    expect(html).toContain("Hiring assistant");
    expect(html).not.toContain("{{color");
  });

  it("substitutes color placeholders before MJML compilation", async () => {
    const html = await compileMjmlToHtml(
      '<mjml><mj-body><mj-text color="{{colorBrandPrimary}}">{{heading}}</mj-text></mj-body></mjml>',
      { heading: "Welcome" },
    );
    expect(html).toContain(brand.primary);
    expect(html).toContain("Welcome");
    expect(html).not.toContain("{{color");
  });
});
