/**
 * @fileoverview Generic findings tab panel used by the Libraries, API calls, Models, RAG,
 * Agents, and Secrets tabs on the Scan Details page.
 *
 * @module pages/AIDetection/ScanDetails/FindingsTabPanel
 */

import { Box, Typography } from "@mui/material";
import { AlertCircle } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Finding } from "../../../../domain/ai-detection/types";
import { palette } from "../../../themes/palette";
import { FindingRow } from "./FindingRow";
import { isFindingSuppressed } from "./scanDetailsConfig";

interface FindingsTabPanelAlertBox {
  severity: "warning" | "error";
  title: string;
  body: string;
}

interface FindingsTabPanelSummaryBox {
  icon: React.ElementType;
  text: React.ReactNode;
  subtext: React.ReactNode;
}

interface FindingsTabPanelProps {
  description: React.ReactNode;
  /** Extra content rendered above the list (e.g. Libraries' StatCard grid) */
  statCardsRow?: React.ReactNode;
  /** When set, uses the "grouped" Libraries-style layout (heading + nested pagination) */
  listHeading?: string;
  alertBox?: FindingsTabPanelAlertBox;
  summaryBox?: FindingsTabPanelSummaryBox;
  findings: Finding[];
  showSuppressed: boolean;
  scanId: number;
  repositoryOwner: string;
  repositoryName: string;
  onStatusMessage?: (variant: "success" | "error", body: string) => void;
  emptyState: React.ReactNode;
  page: number;
  totalPages: number;
  onPageChange: (updater: (p: number) => number) => void;
}

export function FindingsTabPanel({
  description,
  statCardsRow,
  listHeading,
  alertBox,
  summaryBox,
  findings,
  showSuppressed,
  scanId,
  repositoryOwner,
  repositoryName,
  onStatusMessage,
  emptyState,
  page,
  totalPages,
  onPageChange,
}: FindingsTabPanelProps) {
  const isGrouped = listHeading !== undefined;
  const visibleFindings = findings.filter((f) => showSuppressed || !isFindingSuppressed(f));
  const alertColor =
    alertBox?.severity === "warning" ? palette.status.warning : palette.status.error;

  const pagination = totalPages > 1 && (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        gap: isGrouped ? 1 : 2,
        mt: isGrouped ? 2 : "16px",
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
          px: isGrouped ? 2 : undefined,
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
  );

  const findingsList = (
    <Box sx={isGrouped ? undefined : { display: "flex", flexDirection: "column", gap: "4px" }}>
      {visibleFindings.map((finding) => (
        <FindingRow
          key={finding.id}
          finding={finding}
          repositoryOwner={repositoryOwner}
          repositoryName={repositoryName}
          scanId={scanId}
          onStatusMessage={onStatusMessage}
        />
      ))}
      {isGrouped && pagination}
    </Box>
  );

  return (
    <Box sx={{ mt: "8px" }}>
      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
        {description}
      </Typography>

      {statCardsRow}

      {alertBox && findings.length > 0 && (
        <Box
          sx={{
            backgroundColor: alertColor.bg,
            border: `1px solid ${alertColor.border}`,
            borderRadius: "4px",
            p: "16px",
            mb: "16px",
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <AlertCircle size={20} color={alertColor.text} style={{ flexShrink: 0, marginTop: 2 }} />
          <Box>
            <Typography sx={{ fontSize: "14px", fontWeight: 600, color: alertColor.text, mb: 0.5 }}>
              {alertBox.title}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: alertColor.text }}>
              {alertBox.body}
            </Typography>
          </Box>
        </Box>
      )}

      {summaryBox && (
        <Box
          sx={{
            backgroundColor: palette.background.main,
            border: `1px solid ${palette.border.dark}`,
            borderRadius: "4px",
            p: "16px",
            mb: "8px",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <summaryBox.icon size={16} color={palette.text.tertiary} />
            <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>{summaryBox.text}</Typography>
          </Box>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: 1 }}>
            {summaryBox.subtext}
          </Typography>
        </Box>
      )}

      {isGrouped ? (
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: "15px", fontWeight: 500, mt: "8px", mb: 2 }}>
            {listHeading}
          </Typography>
          {findings.length === 0 ? emptyState : findingsList}
        </Box>
      ) : (
        <>
          {findingsList}
          {findings.length === 0 && emptyState}
          {pagination}
        </>
      )}
    </Box>
  );
}
