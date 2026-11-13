import { Slider, Stack, useTheme } from "@mui/material";
import { FC, useCallback } from "react";
import { scoreColor } from "../../../themes/chartTheme";

interface ProgressBarProps {
  progress: string | null;
}

const ProgressBar: FC<ProgressBarProps> = ({ progress }) => {
  const theme = useTheme();

  const progressCount = (progressString: string): number => {
    const [completed, total] = progressString.split("/").map(Number);
    if (Number.isNaN(completed) || Number.isNaN(total)) {
      return 0;
    }
    if (total === 0) {
      return 0;
    }
    if (completed < 0 || total < 0) {
      return 0;
    }
    if (completed > total) {
      return 0;
    }
    return completed / total;
  };

  const value =
    progress && progress !== "" && progress.split("/")[1] !== "0"
      ? progressCount(progress) * 100
      : 0;

  const getProgressColor = useCallback((value: number) => {
    return scoreColor(value); // red at 0% to green at 100%
  }, []);

  return (
    <Stack
      direction="row"
      sx={{
        "& .MuiSlider-track": {
          backgroundColor: getProgressColor(value),
          display: !value ? "none" : "block",
        },
        "& .MuiSlider-thumb": {
          display: "none",
        },
        "& .MuiSlider-rail": {
          opacity: 1,
        },
        "& .MuiSlider-root": {
          p: 0,
        },
      }}
    >
      <Slider
        value={value}
        sx={{
          cursor: "auto",
          height: 8,
          border: "none",
          color: theme.palette.border.light,
        }}
      />
    </Stack>
  );
};

export default ProgressBar;
