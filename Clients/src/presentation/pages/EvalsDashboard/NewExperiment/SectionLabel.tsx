/**
 * @fileoverview Heading for a group of options inside a wizard step
 * ("Your datasets", "Saved models", …). One style so every step matches.
 *
 * @module pages/EvalsDashboard/NewExperiment/SectionLabel
 */

import { Typography } from "@mui/material";
import type { ReactNode } from "react";
import { palette } from "../../../themes/palette";

interface SectionLabelProps {
  children: ReactNode;
  /** Drop the bottom margin when the label sits in a row with other controls */
  noMargin?: boolean;
}

export default function SectionLabel({ children, noMargin = false }: SectionLabelProps) {
  return (
    <Typography
      component="h3"
      sx={{
        fontSize: "13px",
        fontWeight: 600,
        color: palette.text.secondary,
        mb: noMargin ? 0 : "8px",
      }}
    >
      {children}
    </Typography>
  );
}
