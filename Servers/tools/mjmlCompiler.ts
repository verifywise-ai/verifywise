import mjml2html from "mjml";

export const compileMjmlToHtml = async (
  mjmlTemplate: string,
  data: Record<string, string>,
): Promise<string> => {
  let compiledTemplate = mjmlTemplate;
  Object.keys(data).forEach((key) => {
    compiledTemplate = compiledTemplate.replace(new RegExp(`{{${key}}}`, "g"), data[key]);
  });

  // mjml v5 returns a Promise at runtime even though the TypeScript types
  // still describe a sync return. Await through `unknown` so we tolerate
  // both shapes — older v4 sync results pass through Promise.resolve.
  const result = (await Promise.resolve(
    mjml2html(compiledTemplate) as unknown,
  )) as { html: string };
  return result.html;
};
