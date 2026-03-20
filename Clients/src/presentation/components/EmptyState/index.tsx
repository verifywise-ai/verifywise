import type { FC, ReactNode } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import EmptyIllustration from "./EmptyIllustration";

interface EmptyStateProps {
  /**
   * Custom message to display. If not provided, shows default message.
   */
  message?: string;
  /**
   * Alt text for accessibility
   */
  imageAlt?: string;
  /**
   * Whether to show the soft spotlight halo effect on the skeleton card
   * @default false for table empty states, true for full-page empty states
   * @deprecated Kept for backward compatibility, no longer used
   */
  showHalo?: boolean;
  /**
   * Whether to show border around the empty state container
   * @default false for table cells, true for standalone containers
   */
  showBorder?: boolean;
  /**
   * Contextual icon for the illustration (defaults to Inbox)
   */
  icon?: LucideIcon;
  /**
   * Optional content below the message (typically EmptyStateTip components)
   */
  children?: ReactNode;
}

/**
 * Reusable EmptyState component for tables and lists.
 * Displays an abstract SVG illustration with a contextual icon.
 * Optionally renders collapsible tips below the message.
 */
export const EmptyState: FC<EmptyStateProps> = ({
  message = "There is currently no data in this table.",
  imageAlt = "No data available",
  showBorder = false,
  icon = Inbox,
  children,
}) => {
  const theme = useTheme();

  return (
    <Stack
      alignItems="center"
      sx={{
        ...(showBorder && {
          border: `1px dashed ${theme.palette.border.dark}`,
          borderRadius: "4px",
          backgroundColor: theme.palette.background.main,
        }),
        pt: "48px",
        pb: children ? 0 : 12,
      }}
      role="status"
      aria-label={imageAlt}
    >
      <EmptyIllustration icon={icon} />
      <Typography
        sx={{
          fontSize: 13,
          color: theme.palette.text.accent,
          fontWeight: 500,
          paddingX: 10,
          mt: 3,
          textAlign: "center",
          maxWidth: 360,
          lineHeight: 1.5,
        }}
      >
        {message}
      </Typography>
      {children && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            mt: "40px",
            width: "100%",
            maxWidth: 440,
            px: 2,
            pb: "48px",
          }}
        >
          {children}
        </Box>
      )}
    </Stack>
  );
};
