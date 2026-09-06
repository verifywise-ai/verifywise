/**
 * @fileoverview Risk Inheritance Graph node component.
 *
 * Custom node for the inheritance explorer. Shows the entity-type badge (only
 * when the label is non-empty), the raw risk-level string exactly as
 * LinkedRisksPanel does, and the Feature 2 "Parent level changed" chip when
 * the node's own inherited level is stale.
 */

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Chip, Typography, useTheme } from "@mui/material";
import { ENTITY_TYPE_LABELS } from "../../../domain/interfaces/i.riskLink";
import VWTooltip from "../../components/VWTooltip";
import type { RiskInheritanceNodeData } from "./types";
import { ENTITY_TYPE_COLORS } from "./types";

// Mirror EntityNode: truncate long names, full name in the tooltip.
const MAX_NAME_LENGTH = 30;

const truncateName = (name: string): string =>
  name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH)}…` : name;

const RiskNode: React.FC<NodeProps> = ({ data }) => {
  const theme = useTheme();
  const nodeData = data as unknown as RiskInheritanceNodeData;
  const color = ENTITY_TYPE_COLORS[nodeData.entityType];
  const typeLabel = ENTITY_TYPE_LABELS[nodeData.entityType];

  return (
    <VWTooltip header={nodeData.name} content={nodeData.name} placement="top" maxWidth={300}>
      <Box
        tabIndex={0}
        aria-label={`${typeLabel ? `${typeLabel}: ` : ""}${nodeData.name}${
          nodeData.riskLevel ? `. Risk level: ${nodeData.riskLevel}` : ""
        }${nodeData.staleSince ? ". Parent level changed." : ""}`}
        sx={{
          "bgcolor": "common.white",
          "border": `2px solid ${color}`,
          "borderRadius": 1,
          "padding": "8px 12px",
          "minWidth": 130,
          "maxWidth": 220,
          "boxShadow": 1,
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        }}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: color, border: "none", width: 8, height: 8 }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
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
            {truncateName(nodeData.name ?? `Risk`)}
          </Typography>
          {typeLabel && <Chip size="small" variant="outlined" label={typeLabel} />}
        </Box>

        {(nodeData.riskLevel || nodeData.staleSince) && (
          <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
            {nodeData.riskLevel && <Chip size="small" label={nodeData.riskLevel} />}
            {nodeData.staleSince && (
              <Chip
                size="small"
                color="warning"
                label="Parent level changed"
                title={new Date(nodeData.staleSince).toLocaleString()}
              />
            )}
          </Box>
        )}

        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: color, border: "none", width: 8, height: 8 }}
        />
      </Box>
    </VWTooltip>
  );
};

export default memo(RiskNode);
