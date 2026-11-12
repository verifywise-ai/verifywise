/**
 * Fills `{name}` placeholders in a translated template.
 *
 * The DOM translator looks up whole text nodes, but React renders every
 * `{value}` in a sentence as a node of its own, so a sentence with a number or a
 * name in it never reaches the dictionary as one string. Those sentences are
 * written as a template, translated with `t()`, then filled here. Values go in
 * by name because other languages reorder the words around them.
 *
 * An unknown placeholder is left as written instead of rendering "undefined".
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder,
  );
}

/**
 * Picks the singular or plural template for a count using the active
 * language's plural rules, not English's: French reads 0 as singular
 * ("0 expérience"), English as plural ("0 experiments").
 *
 * Dictionary keys stay English, so pass the English singular and plural
 * templates and translate the result with `t()`.
 */
export function pluralKey(lang: string, count: number, one: string, other: string): string {
  let category: Intl.LDMLPluralRule;
  try {
    category = new Intl.PluralRules(lang).select(count);
  } catch {
    category = count === 1 ? "one" : "other";
  }
  return category === "one" ? one : other;
}
