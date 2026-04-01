import {
  Box,
  Stack,
  Typography,
  useTheme,
  LinearProgress,
} from "@mui/material";
import { background } from "../../../themes/palette";

interface ProgressTrackerProps {
  currentStep: number;
  totalSteps: number;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  currentStep,
  totalSteps,
}) => {
  const theme = useTheme();

  // Calculate percentage
  const percentage =
    totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  return (
    <Box
      sx={{
        mb: 4,
        p: 4,
        borderRadius: theme.shape.borderRadius,
        bgcolor: theme.palette.background.main,
        color: theme.palette.text.primary,
        border: 1,
        borderColor: theme.palette.divider,
      }}
    >
      {/* Progress Stats */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography fontSize={14} fontWeight={600} color="text.primary">
            Question {currentStep} of {totalSteps}
          </Typography>
        </Stack>

        <Box
          sx={{
            px: 2,
            py: 0.5,
            borderRadius: 2,
            bgcolor: `${background.main}`,
            border: 1,
            borderColor: theme.palette.primary.main,
          }}
        >
          <Typography
            fontSize={14}
            fontWeight={700}
            sx={{
              color: theme.palette.primary.main,
            }}
          >
            {percentage}%
          </Typography>
        </Box>
      </Stack>

      {/* Progress Bar */}
      <Box sx={{ width: "100%", position: "relative", my: 5 }}>
        <LinearProgress
          variant="determinate"
          value={percentage}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.palette.grey[200],
            "& .MuiLinearProgress-bar": {
              backgroundColor: theme.palette.primary.main,
              borderRadius: 4,
              transition: "all 0.3s ease-in-out",
            },
          }}
        />
      </Box>
    </Box>
  );
};

export default ProgressTracker;
