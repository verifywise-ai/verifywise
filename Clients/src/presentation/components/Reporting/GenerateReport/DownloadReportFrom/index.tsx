import React from "react";
import { Stack, Typography, CircularProgress } from "@mui/material";
import { styles } from "./styles";
import { IStatusProps } from "../../../../../domain/interfaces/i.status";
import { brand } from "../../../../themes/palette";

// Status-driven: this form is only ever mounted while a report run is in
// flight (enqueueing or "running"). There is no real percentage to show —
// the backend worker doesn't report progress — so an indeterminate spinner
// is the honest representation. Terminal states (success/error) are handled
// by the parent, which swaps this form out.
const DownloadReportForm: React.FC<IStatusProps> = ({ aiEnhanced = false }) => {
  return (
    <Stack sx={styles.container} spacing={2} alignItems="center">
      <CircularProgress size={32} sx={{ color: brand.primary }} />
      <Typography sx={styles.titleText}>Generating report...</Typography>
      <Typography sx={styles.baseText}>
        {aiEnhanced
          ? "AI-enhanced reports take a bit longer. Your report will download automatically."
          : "Your report will download automatically when ready."}
      </Typography>
    </Stack>
  );
};

export default DownloadReportForm;
