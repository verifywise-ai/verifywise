/**
 * @fileoverview Finding row component for Library (and other generic) findings.
 *
 * @module pages/AIDetection/ScanDetails/FindingRow
 */

import { useState } from "react";
import { Box, Collapse, IconButton, Tooltip, Typography } from "@mui/material";
import { ChevronDown, ChevronRight, EyeOff, FileCode, MoreHorizontal, Scale } from "lucide-react";
import Chip from "../../../components/Chip";
import SuppressFindingDialog from "../components/SuppressFindingDialog";
import { Finding, GovernanceStatus } from "../../../../domain/ai-detection/types";
import { palette, radiusPx } from "../../../themes/palette";
import { getProviderIcon } from "./providerIcons";
import { FilePathItem } from "./FilePathItem";
import { FindingRowGovernancePopover } from "./FindingRowGovernancePopover";
import { FindingGovernanceStatus } from "./FindingGovernanceStatus";
import { useFindingGovernance } from "./useFindingGovernance";
import { useCan } from "../../../../application/hooks/useCan";
import {
  CONFIDENCE_CHIP_VARIANT,
  CONFIDENCE_TOOLTIPS,
  GOVERNANCE_STATUS_CONFIG,
  isFindingSuppressed,
  LICENSE_RISK_CONFIG,
  RISK_LEVEL_CONFIG,
} from "./scanDetailsConfig";

// ============================================================================
// Finding Row Component (for Library findings)
// ============================================================================

interface FindingRowProps {
  finding: Finding;
  repositoryOwner: string;
  repositoryName: string;
  scanId: number;
  onGovernanceChange?: (findingId: number, status: GovernanceStatus | null) => void;
  onStatusMessage?: (variant: "success" | "error", body: string) => void;
}

export function FindingRow({
  finding,
  repositoryOwner,
  repositoryName,
  scanId,
  onGovernanceChange,
  onStatusMessage,
}: FindingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const {
    anchorEl: governanceAnchor,
    openMenu: handleGovernanceClick,
    closeMenu: handleGovernanceClose,
    governance,
    isUpdating,
    changeStatus: handleStatusChange,
  } = useFindingGovernance({ finding, scanId, onGovernanceChange, onStatusMessage });
  const canEdit = useCan("aiDetection.edit");
  const localStatus = governance.status;
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false);

  const getFileUrl = (filePath: string, lineNumber: number | null): string | null => {
    if (!repositoryOwner || !repositoryName) return null;
    const baseUrl = `https://github.com/${repositoryOwner}/${repositoryName}/blob/HEAD/${filePath}`;
    return lineNumber ? `${baseUrl}#L${lineNumber}` : baseUrl;
  };

  const StatusIcon = localStatus ? GOVERNANCE_STATUS_CONFIG[localStatus].icon : MoreHorizontal;
  const statusColor = localStatus
    ? GOVERNANCE_STATUS_CONFIG[localStatus].color
    : palette.text.tertiary;

  return (
    <Box
      sx={{
        border: `1px solid ${palette.border.light}`,
        borderRadius: radiusPx.sm,
        mb: "8px",
        backgroundColor: palette.background.main,
        opacity: isFindingSuppressed({ ...finding, governance_status: localStatus }) ? 0.6 : 1,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          "display": "flex",
          "alignItems": "center",
          "p": "8px",
          "cursor": "pointer",
          "&:hover": {
            backgroundColor: palette.background.accent,
          },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <IconButton size="small" sx={{ mr: 1 }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>

        <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", mr: "8px" }}>
            {getProviderIcon(finding.provider, 32)}
          </Box>
          <Box>
            <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>{finding.name}</Typography>
            {finding.description && (
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: 0.5 }}>
                {finding.description}
              </Typography>
            )}
            <FindingGovernanceStatus {...governance} />
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Suppression rule badge (a manual "Suppressed" status shows as the status chip) */}
          {finding.suppressed === true && (
            <Tooltip title="Matched a suppression rule" arrow placement="top">
              <Box
                sx={{
                  px: "8px",
                  py: "2px",
                  borderRadius: radiusPx.sm,
                  backgroundColor: palette.background.accent,
                  border: `1px solid ${palette.border.light}`,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <EyeOff size={12} color={palette.text.tertiary} />
                <Typography
                  sx={{ fontSize: "12px", fontWeight: 500, color: palette.text.tertiary }}
                >
                  Suppressed
                </Typography>
              </Box>
            </Tooltip>
          )}
          {/* Risk Level Badge */}
          {finding.risk_level && (
            <Tooltip title={RISK_LEVEL_CONFIG[finding.risk_level].tooltip} arrow placement="top">
              <Box
                sx={{
                  px: "8px",
                  py: "2px",
                  borderRadius: radiusPx.sm,
                  backgroundColor: RISK_LEVEL_CONFIG[finding.risk_level].bgColor,
                  border: `1px solid ${RISK_LEVEL_CONFIG[finding.risk_level].color}20`,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: RISK_LEVEL_CONFIG[finding.risk_level].color,
                  }}
                >
                  {RISK_LEVEL_CONFIG[finding.risk_level].label}
                </Typography>
              </Box>
            </Tooltip>
          )}
          {/* License Badge */}
          {finding.license_id && finding.license_risk && (
            <Tooltip
              title={
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: 12 }}>
                    {finding.license_name || finding.license_id}
                  </Typography>
                  <Typography sx={{ fontSize: 11, mt: 0.5 }}>
                    {LICENSE_RISK_CONFIG[finding.license_risk]?.tooltip ||
                      "License information available"}
                  </Typography>
                </Box>
              }
              arrow
              placement="top"
            >
              <Box
                sx={{
                  px: "8px",
                  py: "2px",
                  borderRadius: radiusPx.sm,
                  backgroundColor:
                    LICENSE_RISK_CONFIG[finding.license_risk]?.bgColor || palette.status.default.bg,
                  border: `1px solid ${LICENSE_RISK_CONFIG[finding.license_risk]?.color || palette.text.tertiary}20`,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Scale
                  size={12}
                  color={LICENSE_RISK_CONFIG[finding.license_risk]?.color || palette.text.tertiary}
                />
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color:
                      LICENSE_RISK_CONFIG[finding.license_risk]?.color || palette.text.tertiary,
                  }}
                >
                  {finding.license_id}
                </Typography>
              </Box>
            </Tooltip>
          )}
          <Box sx={{ minWidth: 120, display: "flex", justifyContent: "center" }}>
            <Tooltip title={CONFIDENCE_TOOLTIPS[finding.confidence]} arrow placement="top">
              <span>
                <Chip
                  label={`${finding.confidence.charAt(0).toUpperCase() + finding.confidence.slice(1)} confidence`}
                  variant={CONFIDENCE_CHIP_VARIANT[finding.confidence]}
                  size="small"
                />
              </span>
            </Tooltip>
          </Box>
          {finding.finding_status && finding.finding_status !== "active" && (
            <Chip
              label={finding.finding_status === "carried_forward" ? "Carried forward" : "Fixed"}
              size="small"
              variant={finding.finding_status === "fixed" ? "success" : "info"}
            />
          )}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              minWidth: 85,
              justifyContent: "flex-end",
            }}
          >
            <FileCode size={14} color={palette.text.tertiary} />
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {finding.file_count} {finding.file_count === 1 ? "file" : "files"}
            </Typography>
          </Box>
          {/* Governance Status Button */}
          {/* Status changes need the permission the endpoint authorizes on */}
          {canEdit && (
            <Tooltip title={localStatus ? "Change status" : "Set status"} arrow placement="top">
              <IconButton
                size="small"
                onClick={handleGovernanceClick}
                disabled={isUpdating}
                aria-label={localStatus ? "Change status" : "Set status"}
                sx={{
                  "border": `1px solid ${palette.border.light}`,
                  "borderRadius": radiusPx.sm,
                  "p": "4px",
                  "&:hover": { backgroundColor: palette.background.hover },
                }}
              >
                <StatusIcon size={16} color={statusColor} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Governance Status Popover */}
      <FindingRowGovernancePopover
        anchorEl={governanceAnchor}
        localStatus={localStatus}
        onClose={handleGovernanceClose}
        onStatusChange={handleStatusChange}
        onCreateSuppressionRule={() => {
          handleGovernanceClose();
          setSuppressDialogOpen(true);
        }}
      />

      <SuppressFindingDialog
        isOpen={suppressDialogOpen}
        finding={finding}
        onClose={() => setSuppressDialogOpen(false)}
        onSuccess={(msg) => onStatusMessage?.("success", msg)}
        onError={(msg) => onStatusMessage?.("error", msg)}
      />

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: "8px", borderTop: `1px solid ${palette.border.light}` }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 500, mb: 1 }}>Found in:</Typography>
          <Box
            sx={{
              maxHeight: 200,
              overflow: "auto",
              backgroundColor: palette.background.accent,
              borderRadius: radiusPx.sm,
              p: 1,
            }}
          >
            {finding.file_paths.slice(0, 20).map((fp, idx) => (
              <FilePathItem
                key={idx}
                path={fp.path}
                lineNumber={fp.line_number}
                matchedText={fp.matched_text}
                fileUrl={getFileUrl(fp.path, fp.line_number)}
              />
            ))}
            {finding.file_paths.length > 20 && (
              <Typography
                sx={{
                  fontSize: "13px",
                  color: palette.text.tertiary,
                  fontStyle: "italic",
                  mt: 1,
                  px: 1,
                }}
              >
                And {finding.file_paths.length - 20} more files...
              </Typography>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
