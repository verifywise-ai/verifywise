import { background, status, text } from "../../themes/palette";

/** Visual tokens and sx styles for DeadlineWarningBox (ISSUE_DEADLINE_WARNING_SYSTEM.md). */
export const deadlineWarningStyles = {
  banner: {
    background: status.warning.bg,
    border: `1px solid ${status.warning.border}`,
    borderRadius: "4px",
    px: 6,
    py: 6,
  },
  divider: {
    my: 6,
    borderColor: status.warning.border,
  },
  header: {
    color: status.warning.text,
    iconRow: {
      minWidth: 0,
    },
    title: {
      fontSize: 13,
      fontWeight: 700,
      color: status.warning.text,
      lineHeight: 1.4,
    },
    snoozeButton: {
      "flexShrink": 0,
      "p": 0.5,
      "color": status.warning.text,
      "&:hover": { backgroundColor: "rgba(217, 119, 6, 0.08)" },
    },
  },
  counts: {
    row: {
      gap: 4,
      rowGap: 4,
    },
    text: {
      fontSize: 13,
      fontWeight: 500,
      color: status.warning.text,
      lineHeight: 1.4,
    },
  },
  menu: {
    paper: {
      minWidth: "180px",
      boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)",
      borderRadius: "8px",
      mt: 0.5,
    },
    item: {
      "fontSize": "13px",
      "padding": "8px 12px",
      "color": text.primary,
      "&:hover": { backgroundColor: `${background.accent} !important` },
    },
    itemTypography: {
      fontSize: "13px",
    },
  },
} as const;
