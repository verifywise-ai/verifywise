import { chartTheme } from "../../../themes/chartTheme";

export type PriorityLevel = "high priority" | "medium priority" | "low priority";

export const priorities = {
  "high priority": { color: chartTheme.priority.high },
  "medium priority": { color: chartTheme.priority.medium },
  "low priority": { color: chartTheme.priority.low },
};
