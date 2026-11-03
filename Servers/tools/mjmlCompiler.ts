import fs from "fs";
import path from "path";
import mjml2html from "mjml";
import { escapeHtml } from "../utils/sanitization.utils";
import { applyColorTokens } from "./emailColors";

const PARTIALS_DIR = path.join(__dirname, "../templates/partials");
const ANY_INCLUDE = /<mj-include\b[^>]*>(?:\s*<\/mj-include>)?/gi;
const PATH_ATTRIBUTE = /\bpath\s*=\s*(["'])(.*?)\1/i;
const PARTIAL_PATH = /^\.\/partials\/([a-z0-9-]+\.mjml)$/;

// Templates share their <mj-head> through
// <mj-include path="./partials/email-head.mjml" />. The include is expanded
// here, before color tokens are applied, so tokens inside a partial are
// substituted too. mjml itself ignores includes, so an include this step did
// not expand would be dropped without a trace: an include of anything other
// than a file in templates/partials, or of a missing partial, throws instead,
// so a broken include never sends a half-styled email. Partials are read on
// every compile, like the templates that include them.
const expandPartials = (template: string): string =>
  template.replace(ANY_INCLUDE, (include) => {
    const name = PATH_ATTRIBUTE.exec(include)?.[2].match(PARTIAL_PATH)?.[1];
    if (!name) {
      throw new Error(`Unsupported mj-include in email template: ${include}`);
    }
    return fs.readFileSync(path.join(PARTIALS_DIR, name), "utf-8");
  });

// A value is inserted as raw HTML only when its key says so (e.g.
// downloadButtonHtml, entity_links_html). Every other value is escaped, so
// user-entered text (names, titles, descriptions) can never inject markup.
const RAW_HTML_KEY = /(Html|_html)$/;

export const compileMjmlToHtml = async (
  mjmlTemplate: string,
  data: Record<string, string>,
): Promise<string> => {
  // One pass with a replacer function: values are inserted literally, so a
  // "$&" or "$'" in user text is not read as a replacement pattern, and a
  // "{{key}}" inside a value is not substituted by a later key.
  const compiledTemplate = applyColorTokens(expandPartials(mjmlTemplate)).replace(
    /{{(\w+)}}/g,
    (placeholder, key: string) => {
      if (!Object.prototype.hasOwnProperty.call(data, key)) return placeholder;
      return RAW_HTML_KEY.test(key) ? String(data[key] ?? "") : escapeHtml(data[key]);
    },
  );

  // mjml v5 returns a Promise at runtime even though the TypeScript types
  // still describe a sync return. Await through `unknown` so we tolerate
  // both shapes — older v4 sync results pass through Promise.resolve.
  const result = (await Promise.resolve(
    mjml2html(compiledTemplate, { ignoreIncludes: true }) as unknown,
  )) as {
    html: string;
  };
  return result.html;
};
