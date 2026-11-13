/**
 * @fileoverview Governance status state and handlers shared by the finding rows.
 *
 * Keeps the row's status, who set it and when, and saves changes. A status
 * saved on the repository's latest scan is also stored for the repository by
 * the backend, so later scans show it on the same finding; on an older scan it
 * changes that scan only, and the confirmation says so.
 *
 * @module pages/AIDetection/ScanDetails/useFindingGovernance
 */

import { useState } from "react";
import type React from "react";
import { updateFindingGovernanceStatus } from "../../../../application/repository/aiDetection.repository";
import { Finding, GovernanceStatus } from "../../../../domain/ai-detection/types";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import { GOVERNANCE_STATUS_CONFIG } from "./scanDetailsConfig";

export interface FindingGovernanceState {
  status: GovernanceStatus | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

interface UseFindingGovernanceOptions {
  finding: Finding;
  scanId: number;
  onGovernanceChange?: (findingId: number, status: GovernanceStatus | null) => void;
  onStatusMessage?: (variant: "success" | "error", body: string) => void;
}

function fromFinding(finding: Finding): FindingGovernanceState {
  return {
    status: finding.governance_status || null,
    updatedByName: finding.governance_updated_by_name ?? null,
    updatedAt: finding.governance_updated_at ?? null,
  };
}

export function useFindingGovernance({
  finding,
  scanId,
  onGovernanceChange,
  onStatusMessage,
}: UseFindingGovernanceOptions) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [governance, setGovernance] = useState<FindingGovernanceState>(() => fromFinding(finding));
  const [isUpdating, setIsUpdating] = useState(false);

  const openMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const closeMenu = () => setAnchorEl(null);

  const changeStatus = async (newStatus: GovernanceStatus | null) => {
    closeMenu();
    if (newStatus === governance.status) return;

    setIsUpdating(true);
    try {
      const result = await updateFindingGovernanceStatus(scanId, finding.id, newStatus);
      setGovernance({
        status: newStatus,
        updatedByName: result.governance_updated_by_name ?? null,
        updatedAt: result.governance_updated_at ?? null,
      });
      onGovernanceChange?.(finding.id, newStatus);
      const statusLabel = newStatus ? GOVERNANCE_STATUS_CONFIG[newStatus].label : "unreviewed";
      onStatusMessage?.(
        "success",
        result.decision_scope === "scan"
          ? fill(t("Status updated on this scan only: {status}"), { status: statusLabel })
          : `Status updated to ${statusLabel}`,
      );
    } catch {
      // The row keeps its last saved status
      onStatusMessage?.("error", "Failed to update governance status");
    } finally {
      setIsUpdating(false);
    }
  };

  return { anchorEl, openMenu, closeMenu, governance, isUpdating, changeStatus };
}
