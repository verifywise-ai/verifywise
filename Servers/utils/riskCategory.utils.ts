/**
 * A stored risk_category as a list. The column is an enum array, which the
 * driver may hand back as a Postgres array literal ("{a,\"b c\"}").
 *
 * Kept apart from risk.utils so the automation helpers can use it without an
 * import cycle.
 */
export const storedRiskCategories = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  const inner = value.replace(/^\{|\}$/g, "");
  if (inner === "") return [];
  return inner.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
};
