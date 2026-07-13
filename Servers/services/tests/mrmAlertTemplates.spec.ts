import fs from "fs";
import path from "path";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";
import { EMAIL_TEMPLATES, TEMPLATES_DIR } from "../../constants/emailTemplates";

describe("MRM alert email templates", () => {
  it("compiles the breach template with all placeholders substituted", async () => {
    const raw = fs.readFileSync(path.join(TEMPLATES_DIR, EMAIL_TEMPLATES.MRM_BREACH_ALERT), "utf8");
    const html = await compileMjmlToHtml(raw, {
      model_label: "Acme PD v2",
      metric: "psi",
      value: "0.31",
      severity: "critical",
      model_url: "https://app.example.com/model-inventory/models/7",
    });
    for (const expected of [
      "Acme PD v2",
      "psi",
      "0.31",
      "critical",
      "https://app.example.com/model-inventory/models/7",
    ]) {
      expect(html).toContain(expected);
    }
    expect(html).not.toContain("{{");
  });

  it("compiles the revalidation-due template with all placeholders substituted", async () => {
    const raw = fs.readFileSync(
      path.join(TEMPLATES_DIR, EMAIL_TEMPLATES.MRM_REVALIDATION_DUE),
      "utf8",
    );
    const html = await compileMjmlToHtml(raw, {
      model_label: "Acme PD v2",
      due_date: "2026-07-01",
      validation_url: "https://app.example.com/model-inventory/model-risk-management/validation",
    });
    expect(html).toContain("Acme PD v2");
    expect(html).toContain("2026-07-01");
    expect(html).toContain(
      "https://app.example.com/model-inventory/model-risk-management/validation",
    );
    expect(html).not.toContain("{{");
  });
});
