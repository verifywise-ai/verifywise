// Shared color palette for dashboard components
import { brand, text, background, border, status, risk } from "../themes/palette";
import { chartTheme } from "../themes/chartTheme";

export const DASHBOARD_COLORS = {
  // Status/severity colors
  critical: chartTheme.risk.critical,
  high: chartTheme.risk.high,
  medium: chartTheme.risk.medium,
  low: chartTheme.risk.low,
  veryLow: chartTheme.risk.veryLow,

  // State colors
  completed: status.success.text,
  approved: risk.veryLow.text,
  // Medium, not warning: in phase 1 warning is the High orange, which would
  // collide with needsRework, emergencyAction and dueToday. Classic: same amber.
  inProgress: risk.medium.text,
  pending: text.disabled,
  draft: status.default.text,
  archived: text.disabled,

  // Framework status colors
  implemented: brand.primary,
  awaitingReview: status.info.text,
  awaitingApproval: chartTheme.status.purple,
  needsRework: risk.high.text,
  notStarted: text.disabled,

  // Incident colors
  open: status.error.text,
  investigating: risk.medium.text,
  mitigated: status.info.text,
  closed: status.success.text,
  suspended: chartTheme.status.purple,
  emergencyAction: risk.high.text,

  // Model lifecycle colors
  restricted: chartTheme.status.orange,
  blocked: status.error.text,

  // Deadline/urgency colors
  overdue: status.error.text,
  overdueBackground: status.error.bg,
  dueToday: risk.high.text,
  dueLater: status.default.text,

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

// Common text styles
export const TEXT_STYLES = {
  label: { fontSize: 11, color: DASHBOARD_COLORS.textSecondary },
  value: { fontSize: 13, fontWeight: 600, color: DASHBOARD_COLORS.textPrimary },
  valueSmall: { fontSize: 14, fontWeight: 600, color: DASHBOARD_COLORS.textPrimary },
  legendItem: { fontSize: 13, color: DASHBOARD_COLORS.textSecondary },
  percentage: { fontSize: 24, fontWeight: 700, color: DASHBOARD_COLORS.textSecondary },
} as const;
