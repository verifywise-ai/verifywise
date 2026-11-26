/**
 * The actions line of a rule card. Rules store an array of `{ type }`; any
 * other shape has no actions, matching how the server reads it when a rule
 * fires.
 */
export function ruleActionsLabel(actions: unknown): string {
  const labels = (Array.isArray(actions) ? actions : [])
    .map((a) => (a && typeof a === "object" ? (a as { type?: unknown }).type : undefined))
    .filter((name): name is string => typeof name === "string" && name !== "")
    .map((name) => name.replace(/_/g, " "));
  return labels.length > 0 ? labels.join(", ") : "None";
}
