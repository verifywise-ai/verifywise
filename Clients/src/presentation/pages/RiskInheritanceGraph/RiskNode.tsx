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
import { Box, Typography, useTheme } from "@mui/material";
import Chip from "../../components/Chip";
import { ENTITY_TYPE_LABELS } from "../../../domain/interfaces/i.riskLink";
import { textStyles } from "../../themes/typography";
import VWTooltip from "../../components/VWTooltip";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import type { RiskInheritanceNodeData } from "./types";
import { ENTITY_TYPE_COLORS } from "./types";

// Mirror EntityNode: truncate long names, full name in the tooltip.
const MAX_NAME_LENGTH = 30;

const truncateName = (name: string): string =>
  name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH)}…` : name;

const RiskNode: React.FC<NodeProps> = ({ data, selected }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const nodeData = data as unknown as RiskInheritanceNodeData;
  const color = ENTITY_TYPE_COLORS[nodeData.entityType];
  const typeLabel = ENTITY_TYPE_LABELS[nodeData.entityType];

  // Assembled here, not left to the DOM translator: an aria-label is one
  // attribute value made of several parts, so no single dictionary key matches it.
  const ariaParts = [`${typeLabel ? `${t(typeLabel)}: ` : ""}${nodeData.name}`];
  if (nodeData.riskLevel) {
    ariaParts.push(fill(t("Risk level: {level}"), { level: t(nodeData.riskLevel) }));
  }
  if (nodeData.staleSince) ariaParts.push(t("Parent level changed."));

  return (
    <VWTooltip header={nodeData.name} content={nodeData.name} placement="top" maxWidth={300}>
      <Box
        tabIndex={0}
        aria-label={ariaParts.join(". ")}
        sx={{
          "bgcolor": "background.main",
          // Selected takes the interactive-card treatment: border to primary,
          // the elevated shadow. The entity-type colour still reads on the handles.
          "border": `2px solid ${selected ? theme.palette.primary.main : color}`,
          "borderRadius": "4px",
          "padding": "8px 12px",
          "minWidth": 130,
          "maxWidth": 220,
          "boxShadow": selected ? theme.boxShadow : "none",
          "transition": "box-shadow 0.2s ease",
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

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Typography
            sx={{
              ...textStyles.subsectionTitle,
              color: "text.primary",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {truncateName(nodeData.name ?? `Risk`)}
          </Typography>
          {typeLabel && <Chip size="small" variant="default" uppercase={false} label={typeLabel} />}
        </Box>

        {(nodeData.riskLevel || nodeData.staleSince) && (
          <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            {nodeData.riskLevel && <Chip size="small" label={nodeData.riskLevel} />}
            {nodeData.staleSince && (
              // VW Chip takes no title, so the native tooltip moves to the wrapper.
              <Box
                component="span"
                sx={{ display: "inline-flex" }}
                title={new Date(nodeData.staleSince).toLocaleString()}
              >
                <Chip size="small" variant="warning" label="Parent level changed" />
              </Box>
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
