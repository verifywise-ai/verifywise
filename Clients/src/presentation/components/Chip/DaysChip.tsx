import { Chip as MuiChip } from "@mui/material";
import { status } from "../../themes/palette";
import { fontSize } from "../../themes/typography";

interface DaysChipProps {
  /** The due date to calculate days from */
  dueDate: Date | string;
  /** Maximum days to display before showing "max+" (default: 50) */
  maxDays?: number;
  /** Threshold for "urgent" styling (default: 3 days) */
  urgentThreshold?: number;
}

/**
 * A chip component that displays the number of days until a due date.
 * - Shows "XD" for days remaining
 * - Shows "50+D" (or custom max) if more than maxDays
 * - Warning (amber) styling if within urgent threshold
 * - Info (blue) styling otherwise
 */
export function DaysChip({ dueDate, maxDays = 50, urgentThreshold = 3 }: DaysChipProps) {
  const dueDateObj = new Date(typeof dueDate === "string" ? dueDate : dueDate.getTime());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDateObj.setHours(0, 0, 0, 0);

  const diffTime = dueDateObj.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const daysLabel = diffDays > maxDays ? `${maxDays}+` : `${diffDays}`;
  const isUrgent = diffDays <= urgentThreshold;
  const colors = isUrgent ? status.warning : status.info;

  return (
    <MuiChip
      label={`${daysLabel}D`}
      size="small"
      sx={{
        fontSize: fontSize.caption,
        backgroundColor: colors.bg,
        color: colors.text,
        borderRadius: "4px",
      }}
    />
  );
}
