/**
 * @fileoverview VersionBadge Component
 *
 * Displays the file version as a compact colored badge.
 * Color varies by review status.
 */

import { Box, Typography } from "@mui/material";
import {
  text,
  border as borderPalette,
  palette as vwPalette,
  radiusPx,
} from "../../../../themes/palette";

interface VersionBadgeProps {
  version?: string;
  reviewStatus?: string;
  size?: "small" | "medium";
}

interface VersionColorConfig {
  backgroundColor: string;
  color: string;
  borderColor: string;
}

const getVersionColors = (reviewStatus?: string): VersionColorConfig => {
  switch (reviewStatus) {
    case "superseded":
      return {
        backgroundColor: vwPalette.background.hover,
        color: `${text.icon}`,
        borderColor: `${borderPalette.dark}`,
      };
    case "approved":
      return {
        backgroundColor: vwPalette.status.success.bg,
        color: "#027A48",
        borderColor: "#A6F4C5",
      };
    default:
      return { backgroundColor: "#EFF8FF", color: "#175CD3", borderColor: "#B2DDFF" };
  }
};

export function VersionBadge({ version, reviewStatus, size = "small" }: VersionBadgeProps) {
  // Default to '1.0' if no version provided
  const effectiveVersion = version || "1.0";
  const colors = getVersionColors(reviewStatus);
  const isSmall = size === "small";

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: isSmall ? 0.75 : 1,
        py: isSmall ? 0.25 : 0.5,
        borderRadius: radiusPx.sm,
        backgroundColor: colors.backgroundColor,
        border: `1px solid ${colors.borderColor}`,
      }}
    >
      <Typography
        sx={{
          fontSize: isSmall ? "12px" : "13px",
          fontWeight: 500,
          color: colors.color,
          lineHeight: 1.4,
          whiteSpace: "nowrap",
        }}
      >
        v{effectiveVersion}
      </Typography>
    </Box>
  );
}

export default VersionBadge;
