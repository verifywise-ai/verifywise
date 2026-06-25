import { useState, useEffect } from "react";
import {
  Box,
  Stack,
  Typography,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  ListItemText,
  Collapse,
} from "@mui/material";
import { AlertTriangle, MoreVertical } from "lucide-react";
import { useAuth } from "../../../application/hooks/useAuth";
import useDeadlineWarnings from "../../../application/hooks/useDeadlineWarnings";
import { SNOOZE_OPTIONS } from "../../../application/config/deadlineConfig";
import { getSnoozeExpiry, setSnooze } from "../../../application/utils/deadlineSnooze";
import { deadlineWarningStyles as styles } from "./deadlineWarning.styles";

/**
 * Banner shown on the Tasks page when the organization has overdue or
 * soon-due tasks. Hidden while snoozed (per-user, persisted) and re-appears
 * automatically once the snooze expires.
 */
const DeadlineWarningBox = () => {
  const { userId } = useAuth();
  const { overdue, dueSoon, isLoading } = useDeadlineWarnings();

  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(() =>
    userId ? getSnoozeExpiry(userId) : null,
  );
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  useEffect(() => {
    if (userId) setSnoozeUntil(getSnoozeExpiry(userId));
  }, [userId]);

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

  if (!userId) return null;

  const isSnoozed = snoozeUntil !== null && Date.now() < snoozeUntil;
  const hasWarnings = overdue > 0 || dueSoon > 0;
  const isVisible = !isLoading && !isSnoozed && hasWarnings;

  const overdueLabel = `${overdue} overdue`;
  const dueSoonLabel = `${dueSoon} due`;

  return (
    <Collapse in={isVisible} timeout={300} unmountOnExit>
      <Box role="alert" sx={styles.banner}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={4}>
          <Stack direction="row" alignItems="center" spacing={1} sx={styles.header.iconRow}>
            <AlertTriangle
              size={16}
              color={styles.header.color}
              style={{ flexShrink: 0 }}
              aria-hidden
            />
            <Typography sx={styles.header.title}>Task deadlines</Typography>
          </Stack>

          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            aria-label="Snooze options"
            aria-haspopup="true"
            aria-expanded={Boolean(anchorEl)}
            sx={styles.header.snoozeButton}
          >
            <MoreVertical size={16} />
          </IconButton>
        </Stack>

        <Divider sx={styles.divider} />

        <Stack
          direction="row"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={styles.counts.row}
        >
          {overdue > 0 && <Typography sx={styles.counts.text}>{overdueLabel}</Typography>}
          {overdue > 0 && dueSoon > 0 && (
            <Typography component="span" aria-hidden sx={styles.counts.text}>
              •
            </Typography>
          )}
          {dueSoon > 0 && <Typography sx={styles.counts.text}>{dueSoonLabel}</Typography>}
        </Stack>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: { sx: styles.menu.paper },
          }}
        >
          {SNOOZE_OPTIONS.map((option) => (
            <MenuItem
              key={option.durationMs}
              onClick={() => handleSnooze(option.durationMs)}
              sx={styles.menu.item}
            >
              <ListItemText
                primary={option.label}
                primaryTypographyProps={styles.menu.itemTypography}
              />
            </MenuItem>
          ))}
        </Menu>
      </Box>
    </Collapse>
  );
};

export default DeadlineWarningBox;
