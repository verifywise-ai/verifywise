/**
 * @fileoverview StatusBadge Component
 *
 * Displays the review status of a file as a colored badge.
 *
 * @module presentation/pages/FileManager/components/StatusBadge
 */

import { Box, Typography } from "@mui/material";
import { ReviewStatus } from "../../../../../application/repository/file.repository";
import { text, border as borderPalette } from "../../../../themes/palette";

interface StatusBadgeProps {
  status?: ReviewStatus;
  size?: "small" | "medium";
}

interface StatusConfig {
  label: string;
  backgroundColor: string;
  color: string;
  borderColor?: string;
}

const STATUS_CONFIGS: Record<ReviewStatus, StatusConfig> = {
  draft: {
    label: "Draft",
    backgroundColor: "#F2F4F7",
    color: `${text.secondary}`,
    borderColor: `${borderPalette.dark}`,
  },
  pending_review: {
    label: "Pending review",
    backgroundColor: "#FEF3F2",
    color: "#B42318",
    borderColor: "#FECDCA",
  },
  approved: {
    label: "Approved",
    backgroundColor: "#ECFDF3",
    color: "#027A48",
    borderColor: "#A6F4C5",
  },
  rejected: {
    label: "Rejected",
    backgroundColor: "#FEF3F2",
    color: "#B42318",
    borderColor: "#FECDCA",
  },
  expired: {
    label: "Expired",
    backgroundColor: "#FFFAEB",
    color: "#B54708",
    borderColor: "#FEDF89",
  },
  superseded: {
    label: "Superseded",
    backgroundColor: "#F2F4F7",
    color: `${text.icon}`,
    borderColor: `${borderPalette.dark}`,
  },
};

/**
 * StatusBadge component for displaying file review status
 */
export function StatusBadge({ status, size = "small" }: StatusBadgeProps) {
  // Default to 'draft' if no status provided
  const effectiveStatus = status || "draft";
  const config = STATUS_CONFIGS[effectiveStatus] || STATUS_CONFIGS.draft;
  const isSmall = size === "small";

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: isSmall ? 1 : 1.5,
        py: isSmall ? 0.25 : 0.5,
        borderRadius: "4px",
        backgroundColor: config.backgroundColor,
        border: `1px solid ${config.borderColor || config.backgroundColor}`,
      }}
    >
      <Typography
        sx={{
          fontSize: isSmall ? "12px" : "13px",
          fontWeight: 500,
          color: config.color,
          lineHeight: 1.4,
          whiteSpace: "nowrap",
        }}
      >
        {config.label}
      </Typography>
    </Box>
  );
}

export default StatusBadge;
