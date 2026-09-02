import type { FC, ReactNode } from "react";
import { Stack, Typography, useTheme } from "@mui/material";
import { CheckCircle2 } from "lucide-react";

interface EmptyStateMessageProps {
  /** Custom message to display when the section is empty */
  message?: string;
  /** Optional custom icon to replace the default check circle */
  icon?: ReactNode;
}

/**
 * Lightweight empty state for dashboard cards and inline sections.
 * Shows a success-style icon with a message indicating no pending items.
 */
export const EmptyStateMessage: FC<EmptyStateMessageProps> = ({
  message = "You're all caught up!",
  icon,
}) => {
  const theme = useTheme();

  return (
    <Stack
      role="status"
      sx={{
        alignItems: "center",
        justifyContent: "center",
        py: 3,
        gap: 1,
      }}
    >
      {icon || <CheckCircle2 size={24} color={theme.palette.primary.main} />}
      <Typography sx={{ fontSize: theme.typography.fontSize, color: theme.palette.other.icon }}>
        {message}
      </Typography>
    </Stack>
  );
};
