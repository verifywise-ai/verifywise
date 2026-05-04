import { Chip as MuiChip } from "@mui/material";

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
 * - Shows "Xd" for days remaining
 * - Shows "50+d" (or custom max) if more than maxDays
 * - Yellow/amber styling if within urgent threshold
 * - Blue styling otherwise
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

  return (
    <MuiChip
      label={`${daysLabel}d`}
      size="small"
      sx={{
        fontSize: 11,
        height: 20,
        backgroundColor: isUrgent ? "#fef3c7" : "#f0f9ff",
        color: isUrgent ? "#92400e" : "#0369a1",
        borderRadius: "4px",
      }}
    />
  );
}
