/**
 * Postgres array literal for a text or enum array bind parameter, e.g.
 * `{"Operational risk","Legal risk"}`. Every element is quoted, with
 * backslashes escaped before double quotes, so a comma, brace, quote or
 * backslash inside a value stays inside that element.
 */
export function pgTextArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}
