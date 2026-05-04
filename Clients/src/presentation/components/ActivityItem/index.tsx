import React, { memo } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";

interface ActivityItemProps {
  title: string;
  timestamp: string;
  type: string;
  isLast?: boolean;
}

const ActivityItem: React.FC<ActivityItemProps> = memo(
  ({ title, timestamp, type, isLast = false }) => {
    const theme = useTheme();

    return (
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        role="listitem"
        aria-label={`${type}: ${title} at ${timestamp}`}
        sx={{
          py: 1,
          borderBottom: isLast ? "none" : `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: theme.typography.body2.fontSize,
              color: theme.palette.text.primary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </Typography>
          <Typography
            sx={{
              fontSize: theme.typography.caption.fontSize,
              color: theme.palette.text.secondary,
            }}
          >
            {type}
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: theme.typography.caption.fontSize,
            color: theme.palette.text.secondary,
            ml: 2,
            flexShrink: 0,
          }}
        >
          {timestamp}
        </Typography>
      </Stack>
    );
  },
);

ActivityItem.displayName = "ActivityItem";

export default ActivityItem;
