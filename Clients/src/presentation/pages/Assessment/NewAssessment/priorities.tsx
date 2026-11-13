import { riskMark } from "../../../themes/palette";

export type PriorityLevel = "high priority" | "medium priority" | "low priority";

export const priorities = {
  "high priority": { color: riskMark.high },
  "medium priority": { color: riskMark.medium },
  "low priority": { color: riskMark.low },
};
