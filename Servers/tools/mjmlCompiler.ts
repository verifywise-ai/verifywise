import mjml2html from "mjml";
import { escapeHtml } from "../utils/sanitization.utils";
import { applyColorTokens } from "./emailColors";

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
  const compiledTemplate = applyColorTokens(mjmlTemplate).replace(
    /{{(\w+)}}/g,
    (placeholder, key: string) => {
      if (!Object.prototype.hasOwnProperty.call(data, key)) return placeholder;
      return RAW_HTML_KEY.test(key) ? String(data[key] ?? "") : escapeHtml(data[key]);
    },
  );

  // mjml v5 returns a Promise at runtime even though the TypeScript types
  // still describe a sync return. Await through `unknown` so we tolerate
  // both shapes — older v4 sync results pass through Promise.resolve.
  const result = (await Promise.resolve(mjml2html(compiledTemplate) as unknown)) as {
    html: string;
  };
  return result.html;
};
