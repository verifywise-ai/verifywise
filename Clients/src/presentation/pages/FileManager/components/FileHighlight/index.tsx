/**
 * @fileoverview FileHighlight Component
 *
 * Displays visual indicators for files that need attention:
 * - Due for update (expiry approaching)
 * - Pending approval
 * - Recently modified
 *
 * @module presentation/pages/FileManager/components/FileHighlight
 */

import { Box, Tooltip } from "@mui/material";
import { AlertTriangle, Clock, FilePen } from "lucide-react";
import { HighlightType } from "../../../../../application/hooks/useHighlightedFiles";

interface FileHighlightProps {
  highlightTypes: HighlightType[];
  size?: "small" | "medium";
}

interface HighlightConfig {
  icon: React.ReactNode;
  tooltip: string;
  color: string;
  backgroundColor: string;
}

const getHighlightConfig = (type: HighlightType, size: "small" | "medium"): HighlightConfig => {
  const iconSize = size === "small" ? 14 : 16;

  const configs: Record<HighlightType, HighlightConfig> = {
    dueForUpdate: {
      icon: <AlertTriangle size={iconSize} />,
      tooltip: "Due for update",
      color: "#B54708",
      backgroundColor: "#FFFAEB",
    },
    pendingApproval: {
      icon: <Clock size={iconSize} />,
      tooltip: "Pending approval",
      color: "#B42318",
      backgroundColor: "#FEF3F2",
    },
    recentlyModified: {
      icon: <FilePen size={iconSize} />,
      tooltip: "Recently modified",
      color: "#026AA2",
      backgroundColor: "#F0F9FF",
    },
  };

  return configs[type];
};

/**
 * FileHighlight component for displaying attention indicators
 */
export function FileHighlight({ highlightTypes, size = "small" }: FileHighlightProps) {
  if (highlightTypes.length === 0) {
    return null;
  }

  // Show only the primary (most important) highlight
  const primaryType = highlightTypes[0];
  const config = getHighlightConfig(primaryType, size);

  const tooltipText =
    highlightTypes.length > 1
      ? `${config.tooltip} (+${highlightTypes.length - 1} more)`
      : config.tooltip;

  return (
    <Tooltip title={tooltipText} arrow placement="top">
      <Box
        sx={{
          "display": "inline-flex",
          "alignItems": "center",
          "justifyContent": "center",
          "width": size === "small" ? 22 : 26,
          "height": size === "small" ? 22 : 26,
          "borderRadius": "4px",
          "backgroundColor": config.backgroundColor,
          "color": config.color,
          "cursor": "help",
          "transition": "transform 0.1s ease",
          "&:hover": {
            transform: "scale(1.1)",
          },
        }}
      >
        {config.icon}
      </Box>
    </Tooltip>
  );
}

/**
 * FileHighlightDot - A smaller, minimal indicator
 */
export function FileHighlightDot({
  highlightType,
  size = "small",
}: {
  highlightType: HighlightType | null;
  size?: "small" | "medium";
}) {
  if (!highlightType) {
    return null;
  }

  const config = getHighlightConfig(highlightType, size);
  const dotSize = size === "small" ? 8 : 10;

  return (
    <Tooltip title={config.tooltip} arrow placement="top">
      <Box
        sx={{
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          backgroundColor: config.color,
          cursor: "help",
          flexShrink: 0,
        }}
      />
    </Tooltip>
  );
}

export default FileHighlight;
