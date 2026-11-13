import { ReactNode } from "react";

import { Stack, Typography, Box } from "@mui/material";

import { descCardbodyStyle, infoCardStyle, infoCardTitleStyle } from "./style";
import { palette } from "../../../themes/palette";

interface DescriptionCardProps {
  title: string;
  body: string;
  icon?: ReactNode;
}

export function DescriptionCard({ title, body, icon }: DescriptionCardProps) {
  return (
    <Stack sx={infoCardStyle}>
      {icon && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: palette.text.accent,
            opacity: 0.7,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography sx={infoCardTitleStyle}>{title}</Typography>
      <Typography sx={descCardbodyStyle}>{body}</Typography>
    </Stack>
  );
}
