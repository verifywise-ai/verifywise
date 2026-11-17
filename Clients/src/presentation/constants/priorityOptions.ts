import { TaskPriority } from "../../domain/enums/task.enum";
import { palette } from "../themes/palette";

export const TASK_PRIORITY_OPTIONS = [TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW];

// Priority display mapping
export const PRIORITY_DISPLAY_MAP: Record<string, string> = {
  [TaskPriority.HIGH]: "High",
  [TaskPriority.MEDIUM]: "Medium",
  [TaskPriority.LOW]: "Low",
};

// Priority color mapping
export const PRIORITY_COLOR_MAP: Record<string, string> = {
  [TaskPriority.HIGH]: palette.riskMark.critical,
  [TaskPriority.MEDIUM]: palette.riskMark.medium,
  [TaskPriority.LOW]: palette.status.success.strong,
};

// Reverse mapping for API calls (display value -> enum value)
export const DISPLAY_TO_PRIORITY_MAP: Record<string, TaskPriority> = {
  Low: TaskPriority.LOW,
  Medium: TaskPriority.MEDIUM,
  High: TaskPriority.HIGH,
};
