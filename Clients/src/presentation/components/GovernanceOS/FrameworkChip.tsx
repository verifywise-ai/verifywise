import React from "react";
import { Box } from "@mui/material";
import { accent, background, text, border as borderPalette } from "../../themes/palette";

interface FrameworkChipProps {
  frameworkName: string;
  priority?: "primary" | "secondary" | "supplementary";
  size?: "small" | "medium";
}

const FRAMEWORK_SLUGS: Record<string, string> = {
  "eu ai act": "eu-ai-act",
  "iso 42001": "iso-42001",
  "iso 27001": "iso-27001",
  "nist ai rmf": "nist-ai-rmf",
};

const FrameworkChip: React.FC<FrameworkChipProps> = ({
  frameworkName,
  priority = "supplementary",
  size = "small",
}) => {
  const colors =
    priority === "primary"
      ? accent.primary
      : priority === "secondary"
        ? accent.indigo
        : { bg: background.hover, text: text.tertiary, border: borderPalette.light };

  const height = size === "small" ? 20 : 24;
  const fontSize = size === "small" ? 11 : 12;
  const padding = size === "small" ? "0 8px" : "0 10px";

  return (
    <Box
      component="span"
      data-framework={FRAMEWORK_SLUGS[frameworkName.toLowerCase()] || frameworkName.toLowerCase()}
      data-priority={priority}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        height,
        padding,
        borderRadius: "4px",
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        fontSize,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {frameworkName}
    </Box>
  );
};

export default FrameworkChip;
