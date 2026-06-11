import { useState, useEffect } from "react";
import { Stack, Typography, Button, Menu, MenuItem, ListItemText } from "@mui/material";
import { AlertTriangle, Clock, ChevronDown } from "lucide-react";
import { useAuth } from "../../../application/hooks/useAuth";
import useDeadlineWarnings from "../../../application/hooks/useDeadlineWarnings";
import { SNOOZE_OPTIONS } from "../../../application/config/deadlineConfig";
import { getSnoozeExpiry, setSnooze } from "../../../application/utils/deadlineSnooze";
import { status, background, text } from "../../themes/palette";

/**
 * Banner shown on the Tasks page when the organization has overdue or
 * soon-due tasks. Hidden while snoozed (per-user, persisted) and re-appears
 * automatically once the snooze expires. Renders nothing when there is
 * nothing to warn about.
 */
const DeadlineWarningBox = () => {
  const { userId } = useAuth();
  const { overdue, dueSoon, dueSoonDays, isLoading } = useDeadlineWarnings();

  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(() =>
    userId ? getSnoozeExpiry(userId) : null,
  );
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Re-read persisted snooze once the user id becomes available.
  useEffect(() => {
    if (userId) setSnoozeUntil(getSnoozeExpiry(userId));
  }, [userId]);

  // Clear the snooze automatically when it expires so the banner re-appears.
  useEffect(() => {
    if (!snoozeUntil) return;
    const remaining = snoozeUntil - Date.now();
    if (remaining <= 0) {
      setSnoozeUntil(null);
      return;
    }
    const timer = setTimeout(() => setSnoozeUntil(null), remaining);
    return () => clearTimeout(timer);
  }, [snoozeUntil]);

  const handleSnooze = (durationMs: number) => {
    if (userId) {
      setSnooze(userId, durationMs);
      setSnoozeUntil(Date.now() + durationMs);
    }
    setAnchorEl(null);
  };

  // Guards: no user, still loading, currently snoozed, or nothing to warn about.
  if (!userId || isLoading) return null;
  if (snoozeUntil !== null && Date.now() < snoozeUntil) return null;
  if (overdue === 0 && dueSoon === 0) return null;

  const isCritical = overdue > 0;
  const palette = isCritical ? status.error : status.warning;

  const parts: string[] = [];
  if (overdue > 0) {
    parts.push(`${overdue} overdue ${overdue === 1 ? "task" : "tasks"}`);
  }
  if (dueSoon > 0) {
    parts.push(
      `${dueSoon} ${dueSoon === 1 ? "task" : "tasks"} due in the next ${dueSoonDays} days`,
    );
  }
  const message = `You have ${parts.join(" and ")}.`;

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "flex-start", sm: "center" }}
      justifyContent="space-between"
      spacing={1.5}
      role="alert"
      sx={{
        py: "10px",
        px: 2,
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
        {isCritical ? (
          <AlertTriangle size={16} color={palette.text} style={{ flexShrink: 0 }} />
        ) : (
          <Clock size={16} color={palette.text} style={{ flexShrink: 0 }} />
        )}
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text }}>
          {message}
        </Typography>
      </Stack>

      <Button
        size="small"
        variant="outlined"
        endIcon={<ChevronDown size={14} />}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-haspopup="true"
        aria-expanded={Boolean(anchorEl)}
        sx={{
          "textTransform": "none",
          "fontSize": 12,
          "fontWeight": 600,
          "minWidth": "auto",
          "flexShrink": 0,
          "px": 1.5,
          "py": 0.25,
          "color": palette.text,
          "borderColor": palette.border,
          "&:hover": {
            color: palette.text,
            borderColor: palette.text,
            backgroundColor: "transparent",
          },
        }}
      >
        Snooze
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              minWidth: "160px",
              boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)",
              borderRadius: "8px",
              mt: 1,
            },
          },
        }}
      >
        {SNOOZE_OPTIONS.map((option) => (
          <MenuItem
            key={option.durationMs}
            onClick={() => handleSnooze(option.durationMs)}
            sx={{
              "fontSize": "13px",
              "padding": "8px 12px",
              "color": text.primary,
              "&:hover": { backgroundColor: `${background.accent} !important` },
            }}
          >
            <ListItemText primary={option.label} primaryTypographyProps={{ fontSize: "13px" }} />
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
};

export default DeadlineWarningBox;
