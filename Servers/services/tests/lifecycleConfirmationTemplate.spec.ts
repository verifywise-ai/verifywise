import fs from "fs";
import path from "path";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";
import { EMAIL_TEMPLATES, TEMPLATES_DIR } from "../../constants/emailTemplates";

describe("lifecycle confirmation email template", () => {
  it("compiles with every placeholder substituted and the values escaped", async () => {
    const raw = fs.readFileSync(
      path.join(TEMPLATES_DIR, EMAIL_TEMPLATES.LIFECYCLE_CONFIRMATION_DUE),
      "utf8",
    );
    const html = await compileMjmlToHtml(raw, {
      recipient_name: "Ada",
      entry_noun: "use case",
      entry_title: "Credit <scoring>",
      since: "2026-06-01",
      interval_days: "90",
      entry_url: "https://app.example.com/project-view?projectId=7",
    });
    for (const expected of [
      "Ada",
      "use case",
      "2026-06-01",
      "90",
      "https://app.example.com/project-view?projectId=7",
      "Credit &lt;scoring&gt;",
    ]) {
      expect(html).toContain(expected);
    }
    expect(html).not.toContain("Credit <scoring>");
    expect(html).not.toContain("{{");
  });
});
