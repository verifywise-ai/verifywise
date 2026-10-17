import React from "react";
import { Box, Typography, useTheme } from "@mui/material";

/**
 * Shown on the report wizard's first page when the selected use case has no
 * framework attached.
 *
 * Framework sections are gated on a projects_frameworks pairing, so a use case
 * without one silently loses the whole Compliance & Governance group from the
 * section list. Saying so here — before the user picks sections or generates —
 * is the difference between an informed choice and a report that looks short
 * for no visible reason.
 */
const NoFrameworkNotice: React.FC = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        p: "8px",
        borderRadius: "4px",
        backgroundColor: theme.palette.background.fill,
        border: "1px solid #d0d5dd",
      }}
    >
      <Box>
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: 500,
            color: theme.palette.text.primary,
            mb: 0.5,
          }}
        >
          This use case has no framework assigned
        </Typography>
        <Typography
          sx={{
            fontSize: "12px",
            color: theme.palette.text.secondary,
            lineHeight: 1.5,
          }}
        >
          Requirements, assessment tracker, clauses and annexes, and NIST subcategories need a
          framework, so they are left out. The report still covers risks, models, vendors, training,
          policies and incidents. Assign a framework to the use case to include compliance sections.
        </Typography>
      </Box>
    </Box>
  );
};

export default NoFrameworkNotice;
