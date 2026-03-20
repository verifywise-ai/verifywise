import React from "react";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import { ModelRiskLevel } from "../../../domain/interfaces/i.modelRisk";
import { ModelRiskSummaryProps } from "../../../domain/interfaces/i.modelInventory";
import { palette } from "../../themes/palette";

const ModelRiskSummary: React.FC<ModelRiskSummaryProps> = ({
  modelRisks,
  onCardClick,
  selectedRiskLevel,
}) => {
  const riskLevels = [
    { key: ModelRiskLevel.LOW, label: "Low", color: palette.risk.low.text },
    { key: ModelRiskLevel.MEDIUM, label: "Medium", color: palette.risk.medium.text },
    { key: ModelRiskLevel.HIGH, label: "High", color: palette.risk.high.text },
    { key: ModelRiskLevel.CRITICAL, label: "Critical", color: palette.risk.critical.text },
  ];

  const items: StatusTileItem[] = [
    { key: "total", label: "Total", count: modelRisks.length, color: palette.text.tertiary },
    ...riskLevels.map((level) => ({
      key: level.key,
      label: level.label,
      count: modelRisks.filter((risk) => risk.risk_level === level.key).length,
      color: level.color,
    })),
  ];

  return (
    <StatusTileCards
      items={items}
      size="small"
      entityName="risk"
      onCardClick={onCardClick}
      selectedKey={selectedRiskLevel}
    />
  );
};

export default ModelRiskSummary;
