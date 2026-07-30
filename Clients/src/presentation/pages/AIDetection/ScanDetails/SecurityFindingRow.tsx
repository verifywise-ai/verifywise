/**
 * @fileoverview Row component for security findings (malicious model file scanning).
 *
 * @module pages/AIDetection/ScanDetails/SecurityFindingRow
 */

import { useState } from "react";
import { Box, Collapse, IconButton, Tooltip, Typography } from "@mui/material";
import { ChevronDown, ChevronRight, FileCode } from "lucide-react";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import { SecurityFinding } from "../../../../domain/ai-detection/types";
import { palette } from "../../../themes/palette";
import { FilePathItem } from "./FilePathItem";
import {
  SEVERITY_BORDER_COLORS,
  SEVERITY_CHIP_VARIANT,
  SEVERITY_TOOLTIPS,
} from "./scanDetailsConfig";

// ============================================================================
// Security Finding Row Component
// ============================================================================

interface SecurityFindingRowProps {
  finding: SecurityFinding;
  repositoryOwner: string;
  repositoryName: string;
}

export function SecurityFindingRow({
  finding,
  repositoryOwner,
  repositoryName,
}: SecurityFindingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = SEVERITY_BORDER_COLORS[finding.severity];

  const getFileUrl = (filePath: string, lineNumber: number | null): string | null => {
    if (!repositoryOwner || !repositoryName) return null;
    const baseUrl = `https://github.com/${repositoryOwner}/${repositoryName}/blob/HEAD/${filePath}`;
    return lineNumber ? `${baseUrl}#L${lineNumber}` : baseUrl;
  };

  return (
    <Box
      sx={{
        border: `1px solid ${borderColor}`,
        borderRadius: "4px",
        mb: "8px",
        backgroundColor: palette.background.main,
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

        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>{finding.name}</Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              in {finding.module_name}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 0.5 }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {finding.cwe_id}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {finding.owasp_ml_id}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ minWidth: 75, display: "flex", justifyContent: "center" }}>
            <Tooltip title={SEVERITY_TOOLTIPS[finding.severity]} arrow placement="top">
              <span>
                <Chip
                  label={finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}
                  variant={SEVERITY_CHIP_VARIANT[finding.severity]}
                  size="small"
                />
              </span>
            </Tooltip>
          </Box>
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
        </Box>
      </Box>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: "8px", borderTop: `1px solid ${palette.border.light}` }}>
          {/* Description */}
          {finding.description && (
            <Typography sx={{ fontSize: "13px", color: palette.text.secondary, mb: 1 }}>
              {finding.description}
            </Typography>
          )}

          {/* Security Details */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "8px",
              mb: "8px",
            }}
          >
            <Box>
              <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}>
                CWE
              </Typography>
              <VWLink
                url={`https://cwe.mitre.org/data/definitions/${finding.cwe_id.replace("CWE-", "")}.html`}
                openInNewTab
              >
                {finding.cwe_id}: {finding.cwe_name}
              </VWLink>
            </Box>
            <Box>
              <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}>
                OWASP ML
              </Typography>
              <VWLink
                url="https://owasp.org/www-project-machine-learning-security-top-10/"
                openInNewTab
              >
                {finding.owasp_ml_id}: {finding.owasp_ml_name}
              </VWLink>
            </Box>
            <Box>
              <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}>
                Threat type
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                {finding.threat_type}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}>
                Operator
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                {finding.operator_name}
              </Typography>
            </Box>
          </Box>

          <Typography sx={{ fontSize: "13px", fontWeight: 500, mb: 1 }}>Found in:</Typography>
          <Box
            sx={{
              maxHeight: 200,
              overflow: "auto",
              backgroundColor: palette.background.accent,
              borderRadius: "4px",
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
