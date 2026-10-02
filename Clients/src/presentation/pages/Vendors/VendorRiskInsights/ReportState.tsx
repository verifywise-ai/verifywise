import { Box, CircularProgress, Typography } from "@mui/material";
import { AlertCircle } from "lucide-react";
import {
  errorAlertSx,
  errorTextSx,
  stateContainerSx,
} from "../../RiskInheritanceGraph/DismissalAnalytics/styles";

/** Loading and error states shared by the vendor risk reports. */
export function ReportLoading() {
  return (
    <Box sx={stateContainerSx}>
      <CircularProgress size={24} />
    </Box>
  );
}

export function ReportError({ message }: { message: string }) {
  return (
    <Box sx={errorAlertSx} role="alert">
      <AlertCircle size={16} />
      <Typography sx={errorTextSx}>{message}</Typography>
    </Box>
  );
}
