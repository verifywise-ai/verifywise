/**
 * @fileoverview Governance status popover shared between FindingRow and VulnerabilityFindingRow.
 *
 * @module pages/AIDetection/ScanDetails/FindingRowGovernancePopover
 */

import { Box, Popover, Typography } from "@mui/material";
import { EyeOff, MoreHorizontal } from "lucide-react";
import { GovernanceStatus } from "../../../../domain/ai-detection/types";
import { GOVERNANCE_STATUS_CONFIG } from "./scanDetailsConfig";
import { palette } from "../../../themes/palette";

interface FindingRowGovernancePopoverProps {
  anchorEl: HTMLElement | null;
  localStatus: GovernanceStatus | null;
  onClose: () => void;
  onStatusChange: (newStatus: GovernanceStatus | null) => void;
  onCreateSuppressionRule: () => void;
}

export function FindingRowGovernancePopover({
  anchorEl,
  localStatus,
  onClose,
  onStatusChange,
  onCreateSuppressionRule,
}: FindingRowGovernancePopoverProps) {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            mt: 0.5,
            borderRadius: "4px",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            border: `1px solid ${palette.border.light}`,
          },
        },
      }}
    >
      <Box sx={{ p: 1, minWidth: 140 }}>
        {(
          Object.entries(GOVERNANCE_STATUS_CONFIG) as [
            GovernanceStatus,
            (typeof GOVERNANCE_STATUS_CONFIG)[GovernanceStatus],
          ][]
        ).map(([status, config]) => (
          <Box
            key={status}
            onClick={() => onStatusChange(status)}
            sx={{
              "display": "flex",
              "alignItems": "center",
              "gap": 1,
              "p": "6px 8px",
              "borderRadius": "4px",
              "cursor": "pointer",
              "backgroundColor": localStatus === status ? palette.background.hover : "transparent",
              "&:hover": { backgroundColor: palette.background.hover },
            }}
          >
            <config.icon size={14} color={config.color} />
            <Typography sx={{ fontSize: "13px" }}>{config.label}</Typography>
          </Box>
        ))}
        {localStatus && (
          <>
            <Box sx={{ borderTop: `1px solid ${palette.border.light}`, my: 0.5 }} />
            <Box
              onClick={() => onStatusChange(null)}
              sx={{
                "display": "flex",
                "alignItems": "center",
                "gap": 1,
                "p": "6px 8px",
                "borderRadius": "4px",
                "cursor": "pointer",
                "&:hover": { backgroundColor: palette.background.hover },
              }}
            >
              <MoreHorizontal size={14} color={palette.text.tertiary} />
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                Clear status
              </Typography>
            </Box>
          </>
        )}
        <Box sx={{ borderTop: `1px solid ${palette.border.light}`, my: 0.5 }} />
        <Box
          onClick={onCreateSuppressionRule}
          sx={{
            "display": "flex",
            "alignItems": "center",
            "gap": 1,
            "p": "6px 8px",
            "borderRadius": "4px",
            "cursor": "pointer",
            "&:hover": { backgroundColor: palette.background.hover },
          }}
        >
          <EyeOff size={14} color={palette.text.tertiary} />
          <Typography sx={{ fontSize: "13px" }}>Create suppression rule…</Typography>
        </Box>
      </Box>
    </Popover>
  );
}
