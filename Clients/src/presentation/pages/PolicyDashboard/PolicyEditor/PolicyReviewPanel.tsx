import { HistorySidebar } from "../../../components/Common/HistorySidebar";

export interface PolicyReviewPanelProps {
  isOpen: boolean;
  isNew: boolean;
  policyId: number | undefined;
}

/** History sidebar region of the policy editor; renders nothing for new policies. */
export function PolicyReviewPanel({ isOpen, isNew, policyId }: PolicyReviewPanelProps) {
  if (isNew || !policyId) return null;

  // History sidebar
  return <HistorySidebar isOpen={isOpen} entityType="policy" entityId={policyId} height="100%" />;
}
