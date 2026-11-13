/**
 * @fileoverview Governance status shown on a finding row: a status chip and
 * who set it and when (e.g. "Approved · by Ada Lovelace · 03-11-2026").
 *
 * @module pages/AIDetection/ScanDetails/FindingGovernanceStatus
 */

import { Box, Tooltip, Typography } from "@mui/material";
import Chip from "../../../components/Chip";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import { palette } from "../../../themes/palette";
import { GOVERNANCE_STATUS_CONFIG } from "./scanDetailsConfig";
import type { FindingGovernanceState } from "./useFindingGovernance";

export function FindingGovernanceStatus({
  status,
  updatedByName,
  updatedAt,
}: FindingGovernanceState) {
  const { t } = useTranslation();
  if (!status) return null;

  const config = GOVERNANCE_STATUS_CONFIG[status];
  const parts: string[] = [];
  if (updatedByName) parts.push(fill(t("by {name}"), { name: updatedByName }));
  if (updatedAt) parts.push(displayFormattedDate(updatedAt));

  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: "8px", mt: "4px", flexWrap: "wrap" }}
      data-testid="finding-governance-status"
    >
      <Tooltip
        title={
          status === "flagged"
            ? t("A status set on the repository's latest scan is kept in later scans.")
            : t(
                "A status set on the repository's latest scan is kept in later scans, unless the finding's risk level rises or, for secrets, vulnerabilities and model security findings, it appears in a new file.",
              )
        }
        arrow
        placement="top"
      >
        <span>
          <Chip label={config.label} variant={config.chipVariant} uppercase={false} size="small" />
        </span>
      </Tooltip>
      {parts.length > 0 && (
        <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
          {parts.join(" · ")}
        </Typography>
      )}
    </Box>
  );
}
