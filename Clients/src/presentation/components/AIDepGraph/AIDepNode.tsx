/**
 * @fileoverview AI Dependency Graph Node Component
 *
 * Custom node component for the AI Dependency Graph visualization.
 */

import React, { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography, useTheme } from "@mui/material";
import {
  Package,
  Bot,
  Globe,
  Key,
  Database,
  Cpu,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import VWTooltip from "../VWTooltip";
import type { AIDepNodeData, DependencyNodeType } from "./types";
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS, RISK_LEVEL_COLORS } from "./types";
import { text } from "../../themes/palette";

// Icons for each node type
const nodeTypeIcons: Record<DependencyNodeType, LucideIcon> = {
  library: Package,
  model: Bot,
  api: Globe,
  secret: Key,
  rag: Database,
  agent: Cpu,
  repository: GitBranch,
};

const AIDepNode: React.FC<NodeProps> = ({
  data,
  sourcePosition,
  targetPosition,
}) => {
  const theme = useTheme();
  const nodeData = data as unknown as AIDepNodeData;
  const IconComponent = nodeTypeIcons[nodeData.nodeType] || Package;
  const color = NODE_TYPE_COLORS[nodeData.nodeType] || `${text.icon}`;
  const riskColor = RISK_LEVEL_COLORS[nodeData.riskLevel];
  const typeLabel = NODE_TYPE_LABELS[nodeData.nodeType];

  // Node size based on connections
  const connections = nodeData.connectionCount || 0;
  const sizeScale =
    connections > 10 ? 1.15 : connections > 5 ? 1.08 : connections > 2 ? 1.0 : 0.95;
  const minWidth = Math.round(130 * sizeScale);
  const maxWidth = Math.round(200 * sizeScale);

  // Build tooltip content
  const tooltipContent = (
    <Box sx={{ fontSize: 12 }}>
      <Box sx={{ mb: 1 }}>
        <strong>Type:</strong> {typeLabel}
      </Box>
      {nodeData.sublabel && (
        <Box sx={{ mb: 1 }}>
          <strong>Provider:</strong> {nodeData.sublabel}
        </Box>
      )}
      <Box sx={{ mb: 1 }}>
        <strong>Confidence:</strong>{" "}
        <span style={{ textTransform: "capitalize" }}>{nodeData.confidence}</span>
      </Box>
      <Box sx={{ mb: 1 }}>
        <strong>Risk level:</strong>{" "}
        <span style={{ color: riskColor, textTransform: "capitalize" }}>
          {nodeData.riskLevel}
        </span>
      </Box>
      <Box>
        <strong>Files:</strong> {nodeData.fileCount}
      </Box>
      {nodeData.governanceStatus && (
        <Box sx={{ mt: 1 }}>
          <strong>Status:</strong>{" "}
          <span style={{ textTransform: "capitalize" }}>
            {nodeData.governanceStatus}
          </span>
        </Box>
      )}
    </Box>
  );

  // Handle keyboard interaction for accessibility
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      // ReactFlow handles the click through its own mechanisms
      // This keydown handler makes the node keyboard accessible
      const target = event.currentTarget as HTMLElement;
      target.click();
    }
  }, []);

  return (
    <VWTooltip header={nodeData.label} content={tooltipContent} placement="top" maxWidth={300}>
      <Box
        tabIndex={0}
        role="button"
        aria-label={`${typeLabel}: ${nodeData.label}. Risk level: ${nodeData.riskLevel}. ${nodeData.fileCount} files. Press Enter to view details.`}
        onKeyDown={handleKeyDown}
        sx={{
          bgcolor: nodeData.isHighlighted ? "warning.light" : "common.white",
          border: nodeData.isHighlighted
            ? `3px solid ${theme.palette.warning.main}`
            : `2px solid ${color}`,
          borderRadius: 1,
          padding: "8px 12px",
          minWidth: minWidth,
          maxWidth: maxWidth,
          boxShadow: nodeData.isHighlighted
            ? `0 0 0 4px ${theme.palette.warning.light}, 0 4px 12px rgba(0,0,0,0.15)`
            : 1,
          cursor: "pointer",
          transition: "all 0.3s ease-in-out",
          transform: nodeData.isHighlighted ? "scale(1.05)" : "scale(1)",
          position: "relative",
          "&:hover": {
            boxShadow: 3,
            transform: "translateY(-1px)",
          },
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        }}
      >
        <Handle
          type="target"
          position={targetPosition || Position.Left}
          style={{
            background: color,
            border: "none",
            width: 8,
            height: 8,
          }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              backgroundColor: color,
              borderRadius: 1,
              p: 0.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden="true"
          >
            <IconComponent size={14} color={theme.palette.common.white} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: theme.typography.caption.fontSize,
                color: "text.primary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {nodeData.label}
            </Typography>
            {nodeData.sublabel && (
              <Typography
                variant="caption"
                sx={{
                  fontSize: 9,
                  color: "text.secondary",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {nodeData.sublabel}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Risk level indicator */}
        <Box
          sx={{
            mt: 0.5,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
          }}
          aria-hidden="true"
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: riskColor,
            }}
          />
          <Typography
            variant="caption"
            sx={{
              fontSize: 9,
              color: riskColor,
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            {nodeData.riskLevel} risk
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: 9,
              color: "text.secondary",
              ml: "auto",
            }}
          >
            {nodeData.fileCount} {nodeData.fileCount === 1 ? "file" : "files"}
          </Typography>
        </Box>

        <Handle
          type="source"
          position={sourcePosition || Position.Right}
          style={{
            background: color,
            border: "none",
            width: 8,
            height: 8,
          }}
        />
      </Box>
    </VWTooltip>
  );
};

export default memo(AIDepNode);
