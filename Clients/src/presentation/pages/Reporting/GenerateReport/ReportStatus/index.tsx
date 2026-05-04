import React from "react";
import { Typography } from "@mui/material";
import { styles } from "../styles";

interface DisabledProps {
  isDisabled: boolean;
}

const ReportStatus: React.FC<DisabledProps> = ({ isDisabled }) => {
  return (
    <>
      {isDisabled && (
        <Typography sx={styles.baseText}>Create a project first to generate a report.</Typography>
      )}
    </>
  );
};

export default ReportStatus;
