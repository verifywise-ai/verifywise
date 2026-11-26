/**
 * Shadow AI rule actions are stored as an array of `{ type }` objects.
 *
 * Demo data created before November 2026 stored an object of flags instead
 * (`{ notify: true, create_alert: true, auto_block: false }`). Migration
 * 20261125220135 rewrites those rows; any other shape reads as no actions
 * here, so a rule never throws when it fires.
 */
export function ruleActionTypes(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((action) =>
      action && typeof action === "object" ? (action as { type?: unknown }).type : undefined,
    )
    .filter((type): type is string => typeof type === "string" && type !== "");
}

/** True when `actions` is an array of objects that each carry a non-empty string `type`. */
export function isRuleActionList(actions: unknown): actions is Array<{ type: string }> {
  return (
    Array.isArray(actions) &&
    actions.every(
      (action) =>
        action !== null &&
        typeof action === "object" &&
        !Array.isArray(action) &&
        typeof (action as { type?: unknown }).type === "string" &&
        (action as { type: string }).type !== "",
    )
  );
}
