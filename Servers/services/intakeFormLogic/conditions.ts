import type { Condition, LogicField } from "./types";
import { toNumber } from "./formula";

/** undefined, null, blank strings and empty arrays are empty; false is an answer. */
export function isEmptyAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

const normalizeText = (value: string): string => value.trim().toLowerCase();

/**
 * Whether one condition holds. `answer` is the referenced field's effective
 * answer (empty when that field is hidden). On an empty answer only is_empty
 * and is_not_checked can be true, so a dependent field stays hidden until the
 * earlier question is answered.
 */
export function conditionHolds(
  condition: Condition,
  referenced: LogicField | undefined,
  answer: unknown,
): boolean {
  if (!referenced) return false;
  const { operator, value } = condition;
  if (operator === "is_empty") return isEmptyAnswer(answer);
  if (operator === "is_not_empty") return !isEmptyAnswer(answer);
  if (operator === "is_checked") return answer === true;
  if (operator === "is_not_checked") return answer !== true;
  if (isEmptyAnswer(answer)) return false;

  switch (operator) {
    case "equals":
    case "not_equals": {
      const wanted = operator === "equals";
      if (referenced.type === "multiselect") {
        return Array.isArray(answer) && answer.includes(value) === wanted;
      }
      if (typeof answer !== "string" || typeof value !== "string") return false;
      const same =
        referenced.type === "select"
          ? answer === value
          : normalizeText(answer) === normalizeText(value);
      return same === wanted;
    }
    case "one_of": {
      const wanted = Array.isArray(value) ? value : [];
      if (referenced.type === "multiselect") {
        return Array.isArray(answer) && answer.some((item) => wanted.includes(item));
      }
      return typeof answer === "string" && wanted.includes(answer);
    }
    case "contains":
      return (
        typeof answer === "string" &&
        typeof value === "string" &&
        value.trim() !== "" &&
        normalizeText(answer).includes(normalizeText(value))
      );
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = toNumber(answer);
      const right = typeof value === "number" && Number.isFinite(value) ? value : null;
      if (left === null || right === null) return false;
      if (operator === "eq") return left === right;
      if (operator === "neq") return left !== right;
      if (operator === "gt") return left > right;
      if (operator === "gte") return left >= right;
      if (operator === "lt") return left < right;
      return left <= right;
    }
    default:
      return false;
  }
}
