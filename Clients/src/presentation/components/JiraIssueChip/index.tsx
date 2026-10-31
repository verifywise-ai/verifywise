import { Box, useTheme } from "@mui/material";
import VWTooltip from "../VWTooltip";
import type {
  JiraIncidentLink,
  LinkState,
} from "../../../application/repository/jiraIncidents.repository";

const STATE_LABELS: Partial<Record<LinkState, string>> = {
  error: "Sync error",
  conflict: "Conflict",
  deleted_in_jira: "Deleted in Jira",
};

/**
 * The Jira key of an imported incident, opening the issue in a new tab. A link
 * in error, conflict or deleted in Jira gets a dot badge and a tooltip with the
 * reason; the anchor is focusable, so the tooltip also opens from the keyboard.
 */
export default function JiraIssueChip({ link }: { link: JiraIncidentLink }) {
  const theme = useTheme();
  if (link.state === "deleted_in_verifywise") return null;

  const stateLabel = STATE_LABELS[link.state];
  const badgeColor =
    link.state === "error"
      ? theme.palette.error.main
      : link.state === "conflict"
        ? theme.palette.warning.main
        : theme.palette.text.secondary;

  const chip = (
    <Box
      component="a"
      href={link.jira_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${link.jira_issue_key} in Jira`}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      sx={{
        "display": "inline-flex",
        "alignItems": "center",
        "gap": "4px",
        "height": "22px",
        "px": "6px",
        "border": `1px solid ${theme.palette.border.dark}`,
        "borderRadius": "4px",
        "fontSize": "12px",
        "lineHeight": 1,
        "whiteSpace": "nowrap",
        "color": theme.palette.text.primary,
        "textDecoration": "none",
        "backgroundColor": theme.palette.background.main,
        "&:hover": { borderColor: theme.palette.primary.main },
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: "1px",
        },
      }}
    >
      {link.jira_issue_key}
      {stateLabel && (
        <Box
          component="span"
          data-testid="jira-chip-badge"
          aria-hidden
          sx={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: badgeColor }}
        />
      )}
    </Box>
  );

  if (!stateLabel) return chip;
  return (
    <VWTooltip content={link.state_reason ? `${stateLabel}: ${link.state_reason}` : stateLabel}>
      {chip}
    </VWTooltip>
  );
}
