import React from "react";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import { PolicyStatusCardProps } from "../../types/interfaces/i.policy";
import { palette } from "../../themes/palette";
import { chartTheme } from "../../themes/chartTheme";

const PolicyStatusCard: React.FC<PolicyStatusCardProps> = ({
  policies,
  onCardClick,
  selectedStatus,
}) => {
  const statusLevels = [
    { key: "Draft", label: "Draft", color: chartTheme.statusSummary.neutral },
    { key: "Under Review", label: "Under review", color: chartTheme.statusSummary.warning },
    { key: "Approved", label: "Approved", color: chartTheme.statusSummary.success },
    { key: "Published", label: "Published", color: chartTheme.statusSummary.info },
    { key: "Archived", label: "Archived", color: chartTheme.statusSummary.neutralDark },
    { key: "Deprecated", label: "Deprecated", color: chartTheme.statusSummary.error },
  ];

  const items: StatusTileItem[] = [
    // Total card first
    {
      key: "total",
      label: "Total",
      count: policies.length,
      color: palette.text.tertiary,
    },
    // Then status cards
    ...statusLevels.map((level) => ({
      key: level.key,
      label: level.label,
      count: policies.filter((p) => p.status === level.key).length,
      color: level.color,
    })),
  ];

  const handleCardClick = (key: string) => {
    if (onCardClick) {
      // Clear filter if "Total" clicked or same status clicked again
      if (key === "total" || selectedStatus === key) {
        onCardClick("");
      } else {
        onCardClick(key);
      }
    }
  };

  return (
    <StatusTileCards
      items={items}
      entityName="policy"
      size="small"
      onCardClick={handleCardClick}
      selectedKey={selectedStatus || undefined}
    />
  );
};

export default PolicyStatusCard;
