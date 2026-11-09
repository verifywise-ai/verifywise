import fs from "fs";
import path from "path";
import { EMAIL_TEMPLATES, TEMPLATES_DIR } from "../../constants/emailTemplates";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";

// notificationService.sendEmailWithTemplate reads these names from
// TEMPLATES_DIR, so a missing or broken file only fails when an email is sent.
describe("EMAIL_TEMPLATES", () => {
  it.each(Object.entries(EMAIL_TEMPLATES))(
    "%s names a template file that compiles",
    async (_key, fileName) => {
      const file = path.join(TEMPLATES_DIR, fileName);
      expect(fs.existsSync(file)).toBe(true);

      const html = await compileMjmlToHtml(fs.readFileSync(file, "utf-8"), {});
      expect(html).toContain("<html");
    },
  );
});
