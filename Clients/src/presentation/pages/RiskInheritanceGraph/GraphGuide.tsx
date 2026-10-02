/**
 * @fileoverview Compact map key, the counterpart of the Link types legend.
 *
 * One line: the node-type colour key (node types are told apart only by border
 * colour) plus an info icon whose tooltip says what the map is. Kept to a
 * single strip on purpose — the canvas is the content, the key must not cover it.
 */

import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { Info } from "lucide-react";
import type { RiskLinkEntityType } from "../../../domain/interfaces/i.riskLink";
import { ENTITY_TYPE_COLORS } from "./types";
import { guidePanelSx, guideIconSx, guideItemSx, guideTextSx, nodeSwatchSx } from "./styles";

export const NODE_LEGEND: { entityType: RiskLinkEntityType; label: string }[] = [
  { entityType: "risk", label: "Project" },
  { entityType: "model_risk", label: "Model" },
  { entityType: "vendor_risk", label: "Vendor" },
];

const GUIDE_TEXT =
  "Each box is a risk, coloured by type. Arrows run from a parent risk to the risks that " +
  'inherit from it. "Parent level changed" marks a risk whose parent moved and needs a second look.';

const GraphGuide: React.FC = () => (
  <Box sx={guidePanelSx} role="note" aria-label="Map key">
    <Tooltip title={GUIDE_TEXT} arrow placement="bottom-end">
      <Box component="span" sx={guideIconSx} tabIndex={0} aria-label="What is this map?">
        <Info size={14} />
      </Box>
    </Tooltip>
    {NODE_LEGEND.map((entry) => (
      <Box key={entry.entityType} sx={guideItemSx}>
        <Box sx={nodeSwatchSx(ENTITY_TYPE_COLORS[entry.entityType])} aria-hidden="true" />
        <Typography sx={guideTextSx}>{entry.label}</Typography>
      </Box>
    ))}
  </Box>
);

export default GraphGuide;
