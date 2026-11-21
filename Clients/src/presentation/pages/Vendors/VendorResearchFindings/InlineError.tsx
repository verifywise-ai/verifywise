import { Box, Typography } from "@mui/material";
import { AlertCircle } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { errorAlertSx, errorTextSx } from "../../RiskInheritanceGraph/DismissalAnalytics/styles";
import { controlHeightSx } from "./styles";

interface InlineErrorProps {
  /** What could not be loaded, as a sentence. A literal in the caller, so that it is translated. */
  message: string;
  onRetry: () => void;
}

/**
 * The box a part of the section shows in place of its content when it could not be loaded: what
 * failed, and a way to try again.
 */
export default function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <Box sx={errorAlertSx} role="alert">
      <AlertCircle size={16} />
      <Typography sx={errorTextSx}>{message}</Typography>
      <Box sx={{ ml: "auto" }}>
        <CustomizableButton size="small" variant="text" onClick={onRetry} sx={controlHeightSx}>
          Retry
        </CustomizableButton>
      </Box>
    </Box>
  );
}
