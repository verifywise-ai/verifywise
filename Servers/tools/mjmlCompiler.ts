import mjml2html from "mjml";

export const compileMjmlToHtml = (mjmlTemplate: string, data: Record<string, string>): string => {
  // Replace placeholders with actual data
  let compiledTemplate = mjmlTemplate;
  Object.keys(data).forEach((key) => {
    compiledTemplate = compiledTemplate.replace(new RegExp(`{{${key}}}`, "g"), data[key]);
  });

  // Convert MJML to HTML. `mjml@4.x` runtime is synchronous; newer
  // `@types/mjml-core` published on DefinitelyTyped types the return as
  // `Promise<MJMLParseResults>`, which breaks the build when Docker resolves
  // fresh (Dockerfile intentionally skips the lockfile). Cast through
  // `unknown` so the code works under both the old sync and newer Promise-typed
  // signatures — the actual runtime shape is sync.
  const { html } = mjml2html(compiledTemplate) as unknown as { html: string };
  return html;
};
