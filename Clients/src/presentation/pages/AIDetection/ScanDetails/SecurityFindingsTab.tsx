/**
 * @fileoverview Security tab panel — malicious model file scan findings.
 *
 * @module pages/AIDetection/ScanDetails/SecurityFindingsTab
 */

import { Box, Typography } from "@mui/material";
import { Info, ShieldCheck } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  SecurityFinding,
  SecuritySeverity,
  SecuritySummary,
} from "../../../../domain/ai-detection/types";
import { palette } from "../../../themes/palette";
import { SecurityFindingRow } from "./SecurityFindingRow";

interface SecurityFindingsTabProps {
  summary: SecuritySummary | null;
  findings: SecurityFinding[];
  page: number;
  totalPages: number;
  onPageChange: (updater: (p: number) => number) => void;
  severityFilter: SecuritySeverity | null;
  onSeverityFilterChange: (
    updater: (f: SecuritySeverity | null) => SecuritySeverity | null,
  ) => void;
  repositoryOwner: string;
  repositoryName: string;
}

export function SecurityFindingsTab({
  summary,
  findings,
  page,
  totalPages,
  onPageChange,
  severityFilter,
  onSeverityFilterChange,
  repositoryOwner,
  repositoryName,
}: SecurityFindingsTabProps) {
  return (
    <Box sx={{ mt: "8px" }}>
      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
        Security vulnerabilities found in model files. Serialized models can contain malicious code
        that executes when loaded.
      </Typography>
      {/* Security Summary Cards - only show when there are findings */}
      {(summary?.total || 0) > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "8px",
            mb: "8px",
          }}
        >
          <Box
            sx={{
              backgroundColor: palette.background.main,
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "4px",
              p: 2,
              textAlign: "center",
            }}
          >
            <Typography sx={{ fontSize: "20px", fontWeight: 600 }}>
              {summary?.total || 0}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              Total findings
            </Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: palette.status.error.bg,
              border: `1px solid ${palette.status.error.border}`,
              borderRadius: "4px",
              p: 2,
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => onSeverityFilterChange((f) => (f === "critical" ? null : "critical"))}
          >
            <Typography
              sx={{
                fontSize: "20px",
                fontWeight: 600,
                color:
                  severityFilter === "critical" ? palette.status.error.text : palette.text.primary,
              }}
            >
              {summary?.by_severity.critical || 0}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              Critical
            </Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: palette.risk.high.bg,
              border: `1px solid ${palette.risk.high.border}`,
              borderRadius: "4px",
              p: 2,
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => onSeverityFilterChange((f) => (f === "high" ? null : "high"))}
          >
            <Typography
              sx={{
                fontSize: "20px",
                fontWeight: 600,
                color: severityFilter === "high" ? palette.risk.high.text : palette.text.primary,
              }}
            >
              {summary?.by_severity.high || 0}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>High</Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: palette.status.warning.bg,
              border: `1px solid ${palette.status.warning.border}`,
              borderRadius: "4px",
              p: 2,
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => onSeverityFilterChange((f) => (f === "medium" ? null : "medium"))}
          >
            <Typography
              sx={{
                fontSize: "20px",
                fontWeight: 600,
                color:
                  severityFilter === "medium" ? palette.status.warning.text : palette.text.primary,
              }}
            >
              {summary?.by_severity.medium || 0}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>Medium</Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: palette.status.info.bg,
              border: `1px solid ${palette.status.info.border}`,
              borderRadius: "4px",
              p: 2,
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => onSeverityFilterChange((f) => (f === "low" ? null : "low"))}
          >
            <Typography
              sx={{
                fontSize: "20px",
                fontWeight: 600,
                color: severityFilter === "low" ? palette.status.info.text : palette.text.primary,
              }}
            >
              {summary?.by_severity.low || 0}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>Low</Typography>
          </Box>
        </Box>
      )}

      {/* Security Findings List */}
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: "15px", fontWeight: 500, mt: "8px", mb: 2 }}>
          Security findings
        </Typography>

        {findings.length === 0 ? (
          <Box
            sx={{
              backgroundColor: palette.status.success.bg,
              border: `1px solid ${palette.status.success.border}`,
              borderRadius: "4px",
              p: 4,
              textAlign: "center",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                mb: 2,
              }}
            >
              <ShieldCheck size={48} color={palette.status.success.text} />
            </Box>
            <Typography
              sx={{
                fontSize: "13px",
                fontWeight: 500,
                color: palette.status.success.text,
                mb: 1,
              }}
            >
              {severityFilter
                ? `No ${severityFilter} severity findings`
                : "No security issues detected"}
            </Typography>
            {!severityFilter && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  mt: 1,
                }}
              >
                <Info size={14} color={palette.text.tertiary} />
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Note: This scan checks for known malicious patterns only. A clean result does not
                  guarantee the model is safe.
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Box>
            {findings.map((finding) => (
              <SecurityFindingRow
                key={finding.id}
                finding={finding}
                repositoryOwner={repositoryOwner}
                repositoryName={repositoryName}
              />
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 1,
                  mt: 2,
                }}
              >
                <CustomizableButton
                  text="Previous"
                  onClick={() => onPageChange((p) => Math.max(1, p - 1))}
                  isDisabled={page === 1}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
                <Typography
                  sx={{
                    fontSize: "13px",
                    lineHeight: "34px",
                    px: 2,
                    color: palette.text.tertiary,
                  }}
                >
                  Page {page} of {totalPages}
                </Typography>
                <CustomizableButton
                  text="Next"
                  onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
                  isDisabled={page === totalPages}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Model files scanned info */}
      {summary && (
        <Box sx={{ mt: 4 }}>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
            {summary.model_files_scanned} model{" "}
            {summary.model_files_scanned === 1 ? "file" : "files"} scanned
          </Typography>
        </Box>
      )}
    </Box>
  );
}
