import { ReactNode } from "react";

import { Stack, Typography, Box, IconButton, Tooltip } from "@mui/material";

import { infoCardbodyStyle, infoCardStyle, infoCardTitleStyle } from "./style";
import { brand, text } from "../../../themes/palette";

interface InfoCardProps {
  title: string;
  body: string;
  icon?: ReactNode;
  actionIcon?: ReactNode;
  actionTooltip?: string;
  onActionClick?: () => void;
  isActionActive?: boolean;
}

export function InfoCard({
  title,
  body,
  icon,
  actionIcon,
  actionTooltip,
  onActionClick,
  isActionActive = false
}: InfoCardProps) {
  return (
    <Stack sx={infoCardStyle}>
      {icon && !actionIcon && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "#8594AC",
            opacity: 0.7,
          }}
        >
          {icon}
        </Box>
      )}
      {actionIcon && onActionClick && (
        <Tooltip title={actionTooltip || ""} arrow>
          <IconButton
            onClick={onActionClick}
            size="small"
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              color: isActionActive ? `${brand.primary}` : `${text.muted}`,
              padding: "4px",
              borderRadius: "4px",
              backgroundColor: isActionActive ? "#E6F4F1" : "transparent",
              "&:hover": {
                backgroundColor: isActionActive ? "#D1EDE6" : "#F2F4F7",
              },
            }}
          >
            {actionIcon}
          </IconButton>
        </Tooltip>
      )}
      <Typography sx={infoCardTitleStyle}>{title}</Typography>
      <Typography sx={infoCardbodyStyle}>{body}</Typography>
    </Stack>
  );
}
