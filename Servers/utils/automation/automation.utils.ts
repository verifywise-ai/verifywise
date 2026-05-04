export function replaceTemplateVariables(
  template: string,
  replacements: Record<string, any>,
): string {
  let result = template;
  Object.entries(replacements).forEach(([key, value]) => {
    const escapedKey = key.replace(/\\/g, "\\\\").replace(/\./g, "\\.");
    const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, "g");
    result = result.replace(regex, String(value ?? ""));
  });
  return result;
}
