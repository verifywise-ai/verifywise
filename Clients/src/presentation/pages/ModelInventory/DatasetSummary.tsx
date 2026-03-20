import React from "react";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import { DatasetSummary as Summary } from "../../../domain/interfaces/i.dataset";
import { palette } from "../../themes/palette";

interface DatasetSummaryProps {
  summary: Summary;
  onCardClick?: (statusKey: string) => void;
  selectedStatus?: string | null;
}

const DatasetSummary: React.FC<DatasetSummaryProps> = ({
  summary,
  onCardClick,
  selectedStatus,
}) => {
  const items: StatusTileItem[] = [
    { key: "total", label: "Total", count: summary.total, color: palette.text.tertiary },
    { key: "draft", label: "Draft", count: summary.draft, color: palette.status.default.text },
    { key: "active", label: "Active", count: summary.active, color: palette.status.success.text },
    { key: "deprecated", label: "Deprecated", count: summary.deprecated, color: palette.risk.medium.text },
    { key: "archived", label: "Archived", count: summary.archived, color: palette.text.accent },
  ];

  return (
    <StatusTileCards
      items={items}
      size="small"
      entityName="dataset"
      onCardClick={onCardClick}
      selectedKey={selectedStatus}
    />
  );
};

export default DatasetSummary;
