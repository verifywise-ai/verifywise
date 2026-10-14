/**
 * @fileoverview StatusBadge Component
 *
 * Displays the review status of a file using the shared StatusBadge.
 *
 * @module presentation/pages/FileManager/components/StatusBadge
 */

import SharedStatusBadge from "../../../../components/StatusBadge";
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
 * File review status. The label map stays here; StatusBadge paints the badge.
 */
export function StatusBadge({ status, size = "small" }: StatusBadgeProps) {
  const effectiveStatus = status || "draft";
  const label = STATUS_LABELS[effectiveStatus] || STATUS_LABELS.draft;

  return <SharedStatusBadge label={label} size={size} />;
}

export default StatusBadge;
