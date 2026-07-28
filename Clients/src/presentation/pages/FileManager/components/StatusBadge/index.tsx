/**
 * @fileoverview StatusBadge Component
 *
 * Displays the review status of a file using the shared StyleGuide Chip.
 *
 * @module presentation/pages/FileManager/components/StatusBadge
 */

import Chip from "../../../../components/Chip";
import { ReviewStatus } from "../../../../../application/repository/file.repository";
import { ChipSize } from "../../../../types/interfaces/i.chip";

interface StatusBadgeProps {
  status?: ReviewStatus;
  size?: ChipSize;
}

const STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  superseded: "Superseded",
};

/**
 * StatusBadge — thin wrapper around Chip for file review status.
 * Matches Model Inventory / StyleGuide status chips.
 */
export function StatusBadge({ status, size = "small" }: StatusBadgeProps) {
  const effectiveStatus = status || "draft";
  const label = STATUS_LABELS[effectiveStatus] || STATUS_LABELS.draft;

  return <Chip label={label} size={size} />;
}

export default StatusBadge;
