/**
 * @fileoverview Header chrome for the Scan Details page: back button, scan summary,
 * action buttons, failure banner, and risk score card.
 *
 * @module pages/AIDetection/ScanDetails/ScanDetailsHeader
 */

import { Box, Typography, Tooltip } from "@mui/material";
import { AlertCircle, ArrowLeft, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import { RiskScoreCard } from "../components/RiskScoreCard";
import { ScanResponse } from "../../../../domain/ai-detection/types";
import { palette } from "../../../themes/palette";

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

interface ScanDetailsHeaderProps {
  scan: ScanResponse;
  onBack: () => void;
  isRecalculating: boolean;
  onRecalculate: () => void;
  isExporting: boolean;
  onExport: () => void;
}

export function ScanDetailsHeader({
  scan,
  onBack,
  isRecalculating,
  onRecalculate,
  isExporting,
  onExport,
}: ScanDetailsHeaderProps) {
  return (
    <>
      {/* Back Button */}
      <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
        <CustomizableButton
          text="Back to history"
          onClick={onBack}
          variant="text"
          startIcon={<ArrowLeft size={16} />}
          sx={{ mb: 3 }}
        />
      </Box>

      {/* Header */}
      <Box
        sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
            {scan.scan.status === "failed" ? (
              <AlertCircle size={24} color={palette.status.error.text} />
            ) : (
              <CheckCircle2 size={24} color={palette.status.success.text} />
            )}
            <Typography sx={{ fontSize: "15px", fontWeight: 600 }}>
              {scan.scan.repository_owner}/{scan.scan.repository_name}
            </Typography>
            {scan.scan.status === "failed" && <Chip label="Failed" size="small" />}
            {scan.scan.scan_mode === "incremental" && (
              <Chip label="Incremental" size="small" variant="info" />
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: "28px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.primary, fontWeight: 500 }}>
              {formatDuration(scan.scan.duration_ms)}
            </Typography>
            {scan.scan.scan_mode === "incremental" && scan.scan.changed_files_count != null && (
              <>
                <Typography sx={{ color: palette.border.dark, fontSize: "12px" }}>•</Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  {scan.scan.changed_files_count} files changed
                </Typography>
              </>
            )}
            <Typography sx={{ color: palette.border.dark, fontSize: "12px" }}>•</Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {scan.scan.status === "failed" ? "Failed" : "Scanned"}{" "}
              {formatDistanceToNow(new Date(scan.scan.created_at), {
                addSuffix: true,
              })}
            </Typography>
            <Typography sx={{ color: palette.border.dark, fontSize: "12px" }}>•</Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>
              by {scan.scan.triggered_by.name}
            </Typography>
          </Box>
        </Box>

        {/* Action Buttons */}
        {scan.scan.status === "completed" && (
          <Box sx={{ display: "flex", gap: "8px" }}>
            <Tooltip title="Recalculate risk score" arrow placement="top">
              <span>
                <CustomizableButton
                  text="Recalculate score"
                  onClick={onRecalculate}
                  variant="outlined"
                  startIcon={<RefreshCw size={16} />}
                  isDisabled={isRecalculating}
                  sx={{ height: 34 }}
                />
              </span>
            </Tooltip>
            <Tooltip title="Export AI Bill of Materials (AI-BOM)" arrow placement="top">
              <span>
                <CustomizableButton
                  text="Export AI-BOM"
                  onClick={onExport}
                  variant="outlined"
                  startIcon={<Download size={16} />}
                  isDisabled={isExporting}
                  sx={{ height: 34 }}
                />
              </span>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Error Message Alert */}
      {scan.scan.status === "failed" && scan.scan.error_message && (
        <Box
          sx={{
            mb: 4,
            p: 2,
            backgroundColor: palette.status.error.bg,
            border: `1px solid ${palette.status.error.border}`,
            borderRadius: "4px",
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <AlertCircle
            size={20}
            color={palette.status.error.text}
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <Box>
            <Typography
              sx={{ fontSize: "14px", fontWeight: 600, color: palette.status.error.text, mb: 0.5 }}
            >
              Scan failed
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.status.error.text }}>
              {scan.scan.error_message}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Risk Score Card - only for completed scans */}
      {scan.scan.status === "completed" && (
        <RiskScoreCard
          score={scan.scan.risk_score ?? null}
          grade={scan.scan.risk_score_grade ?? null}
          details={scan.scan.risk_score_details ?? null}
          calculatedAt={scan.scan.risk_score_calculated_at ?? null}
          isRecalculating={isRecalculating}
        />
      )}
    </>
  );
}
