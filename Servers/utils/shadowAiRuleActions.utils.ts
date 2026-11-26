/**
 * The action types of a Shadow AI rule.
 *
 * Rules store `actions` as an array of `{ type }` objects. Demo data created
 * before November 2026 stored an object of flags instead
 * (`{ notify: true, create_alert: true, auto_block: false }`). Those rules
 * carry no actions the engine knows, so they read as none here instead of
 * throwing when the rule fires.
 */
export function ruleActionTypes(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((action) =>
      action && typeof action === "object" ? (action as { type?: unknown }).type : undefined,
    )
    .filter((type): type is string => typeof type === "string" && type !== "");
}
