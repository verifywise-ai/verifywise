import type { FC } from "react";
import { Box, Stack, Typography, LinearProgress, useTheme } from "@mui/material";
import { palette } from "../../themes/palette";

interface FrameworkProgressProps {
  name: string;
  progress: number;
  completed: number;
  total: number;
  isLast?: boolean;
}

export const FrameworkProgress: FC<FrameworkProgressProps> = ({
  name,
  progress,
  completed,
  total,
  isLast = false,
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ mb: isLast ? 0 : 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
        <Typography
          sx={{
            fontSize: theme.typography.fontSize,
            color: theme.palette.text.primary,
            fontWeight: 500,
          }}
        >
          {name}
        </Typography>
        <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
          {completed}/{total} ({Math.round(progress)}%)
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          "height": 6,
          "borderRadius": 3,
          "backgroundColor": theme.palette.border.light,
          "& .MuiLinearProgress-bar": {
            backgroundColor:
              progress >= 80
                ? palette.status.success.strong
                : progress >= 50
                  ? palette.riskMark.medium
                  : theme.palette.primary.main,
            borderRadius: 3,
          },
        }}
      />
    </Box>
  );
};
