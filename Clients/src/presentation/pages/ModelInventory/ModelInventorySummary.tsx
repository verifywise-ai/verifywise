import React from "react";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import { ModelInventorySummary as Summary } from "../../../domain/interfaces/i.modelInventory";
import { palette } from "../../themes/palette";

interface ModelInventorySummaryProps {
  summary: Summary;
  onCardClick?: (statusKey: string) => void;
  selectedStatus?: string | null;
}

const ModelInventorySummary: React.FC<ModelInventorySummaryProps> = ({
  summary,
  onCardClick,
  selectedStatus,
}) => {
  const items: StatusTileItem[] = [
    { key: "total", label: "Total", count: summary.total, color: palette.text.tertiary },
    { key: "approved", label: "Approved", count: summary.approved, color: palette.status.success.text },
    { key: "restricted", label: "Restricted", count: summary.restricted, color: palette.risk.high.text },
    { key: "pending", label: "Pending", count: summary.pending, color: palette.risk.medium.text },
    { key: "blocked", label: "Blocked", count: summary.blocked, color: palette.status.error.text },
  ];

  return (
    <StatusTileCards
      items={items}
      entityName="model"
      onCardClick={onCardClick}
      selectedKey={selectedStatus}
      size="small"
    />
  );
};

export default ModelInventorySummary;
