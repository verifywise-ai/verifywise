/** Framework id of the EU AI Act. */
const EU_AI_ACT_ID = 1;

/**
 * True when a list of frameworks includes the EU AI Act.
 *
 * The create form holds `{ _id, name }` options, a loaded use case holds
 * `{ framework_id, name }` rows, and older callers pass plain ids or names,
 * so each shape is recognised.
 */
export function includesEuAiAct(frameworks: unknown): boolean {
  if (!Array.isArray(frameworks)) return false;
  return frameworks.some((fw) => {
    if (fw && typeof fw === "object") {
      const { _id, framework_id, name } = fw as {
        _id?: unknown;
        framework_id?: unknown;
        name?: unknown;
      };
      return (
        Number(_id) === EU_AI_ACT_ID || Number(framework_id) === EU_AI_ACT_ID || isEuAiActName(name)
      );
    }
    if (typeof fw === "number") return fw === EU_AI_ACT_ID;
    if (typeof fw === "string") return Number(fw) === EU_AI_ACT_ID || isEuAiActName(fw);
    return false;
  });
}

const isEuAiActName = (name: unknown): boolean =>
  typeof name === "string" && name.trim().toLowerCase() === "eu ai act";
