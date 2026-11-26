/**
 * The actions line of a rule card. Rules store an array of `{ type }`; demo
 * data created before November 2026 stored an object of flags, where only the
 * flags set to true are actions.
 */
export function ruleActionsLabel(actions: unknown): string {
  const names = Array.isArray(actions)
    ? actions.map((a) => (a && typeof a === "object" ? (a as { type?: unknown }).type : undefined))
    : actions && typeof actions === "object"
      ? Object.entries(actions as Record<string, unknown>)
          .filter(([, enabled]) => enabled === true)
          .map(([key]) => key)
      : [];
  const labels = names
    .filter((name): name is string => typeof name === "string" && name !== "")
    .map((name) => name.replace(/_/g, " "));
  return labels.length > 0 ? labels.join(", ") : "None";
}
