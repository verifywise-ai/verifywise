// Shared color palette for dashboard components
import { brand, text, background, border, status, risk } from "../themes/palette";

export const DASHBOARD_COLORS = {
  // Status/severity colors
  critical: risk.critical.text,
  high: risk.high.text,
  medium: risk.medium.text,
  low: risk.low.text,
  veryLow: risk.veryLow.text,

  // State colors
  completed: status.success.text,
  approved: risk.veryLow.text,
  inProgress: status.warning.text,
  pending: text.disabled,
  draft: status.default.text,
  archived: text.disabled,

  // Framework status colors
  implemented: brand.primary,
  awaitingReview: status.info.text,
  awaitingApproval: "#8B5CF6",
  needsRework: risk.high.text,
  notStarted: text.disabled,

  // Incident colors
  open: status.error.text,
  investigating: status.warning.text,
  mitigated: status.info.text,
  closed: status.success.text,

  // Model lifecycle colors
  restricted: "#F97316",
  blocked: status.error.text,

  // Deadline/urgency colors
  overdue: status.error.text,
  overdueBackground: status.error.bg,
  dueToday: risk.high.text,
  dueTodayBackground: risk.high.bg,
  dueThisWeek: status.warning.text,
  dueThisWeekBackground: status.warning.bg,
  dueNextWeek: status.info.text,
  dueNextWeekBackground: status.info.bg,
  dueThisMonth: "#7c3aed",
  dueThisMonthBackground: "#f5f3ff",
  dueLater: status.default.text,
  dueLaterBackground: background.accent,
  noDueDate: text.disabled,
  noDueDateBackground: background.hover,

  // UI colors
  primary: brand.primary,
  white: background.main,
  textPrimary: text.primary,
  textSecondary: text.icon,
  textMuted: text.tertiary,
  border: border.dark,
  borderLight: background.hover,
  backgroundWhite: background.main,
  backgroundHover: status.default.border,
  backgroundLight: background.hover,
  backgroundSubtle: background.accent,
  progressBackground: status.default.border,
} as const;

// Deadline group color configurations for DeadlineView component
export const DEADLINE_COLORS = {
  overdue: { color: DASHBOARD_COLORS.overdue, bgColor: DASHBOARD_COLORS.overdueBackground },
  today: { color: DASHBOARD_COLORS.dueToday, bgColor: DASHBOARD_COLORS.dueTodayBackground },
  thisWeek: { color: DASHBOARD_COLORS.dueThisWeek, bgColor: DASHBOARD_COLORS.dueThisWeekBackground },
  nextWeek: { color: DASHBOARD_COLORS.dueNextWeek, bgColor: DASHBOARD_COLORS.dueNextWeekBackground },
  thisMonth: { color: DASHBOARD_COLORS.dueThisMonth, bgColor: DASHBOARD_COLORS.dueThisMonthBackground },
  later: { color: DASHBOARD_COLORS.dueLater, bgColor: DASHBOARD_COLORS.dueLaterBackground },
  noDueDate: { color: DASHBOARD_COLORS.noDueDate, bgColor: DASHBOARD_COLORS.noDueDateBackground },
} as const;

// Common text styles
export const TEXT_STYLES = {
  label: { fontSize: 11, color: DASHBOARD_COLORS.textSecondary },
  value: { fontSize: 13, fontWeight: 600, color: DASHBOARD_COLORS.textPrimary },
  valueSmall: { fontSize: 14, fontWeight: 600, color: DASHBOARD_COLORS.textPrimary },
  legendItem: { fontSize: 13, color: DASHBOARD_COLORS.textSecondary },
  percentage: { fontSize: 24, fontWeight: 700, color: DASHBOARD_COLORS.textSecondary },
} as const;
