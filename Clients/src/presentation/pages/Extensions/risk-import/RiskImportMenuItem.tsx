import React from "react";
import { Box, Typography } from "@mui/material";
import { FileSpreadsheet } from "lucide-react";
import {
  riskMenuItemStyle,
  riskMenuItemTextWrapStyle,
  riskMenuItemTitleRowStyle,
  riskMenuItemTitleStyle,
  riskMenuItemSubtitleStyle,
} from "../../RiskManagement/style";

interface RiskImportMenuItemProps {
  onClick: () => void;
}

/**
 * "Import from Excel" row in the Add-new-risk popover on the Risk Management
 * page. Rendered only when the risk-import extension is enabled. Uses the
 * shared row style (`riskMenuItemStyle` and friends) so it lines up with the
 * Manual / IBM / MIT rows above it — the style file explicitly documents that
 * this row set is "used by Manual, IBM, MIT, and plugin items".
 */
export default function RiskImportMenuItem({ onClick }: RiskImportMenuItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Box
      role="menuitem"
      tabIndex={0}
      aria-label="Import risks from Excel"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      sx={riskMenuItemStyle}
    >
      <Box sx={riskMenuItemTextWrapStyle}>
        <Box sx={riskMenuItemTitleRowStyle}>
          <Typography sx={riskMenuItemTitleStyle}>Import from Excel</Typography>
        </Box>
        <Typography sx={riskMenuItemSubtitleStyle}>
          Bulk import risks from an Excel file using the provided template
        </Typography>
      </Box>
      {/* Icon slot mirrors the IBM/MIT logo slot for visual alignment. */}
      <FileSpreadsheet size={18} strokeWidth={1.75} color="#13715B" style={{ opacity: 0.75 }} />
    </Box>
  );
}
