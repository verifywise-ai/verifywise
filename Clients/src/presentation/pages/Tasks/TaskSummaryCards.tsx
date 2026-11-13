import React from "react";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import { TaskSummary } from "../../../domain/interfaces/i.task";
import { chartTheme } from "../../themes/chartTheme";

interface TaskSummaryCardsProps {
  summary: TaskSummary;
  onCardClick?: (statusKey: string) => void;
  selectedStatus?: string | null;
}

const TaskSummaryCards: React.FC<TaskSummaryCardsProps> = ({
  summary,
  onCardClick,
  selectedStatus,
}) => {
  const items: StatusTileItem[] = [
    { key: "total", label: "Total", count: summary.total, color: chartTheme.statusSummary.total },
    { key: "open", label: "Open", count: summary.open, color: chartTheme.statusSummary.info },
    {
      key: "overdue",
      label: "Overdue",
      count: summary.overdue,
      color: chartTheme.statusSummary.error,
    },
    {
      key: "inProgress",
      label: "In progress",
      count: summary.inProgress,
      color: chartTheme.statusSummary.warning,
    },
    {
      key: "completed",
      label: "Completed",
      count: summary.completed,
      color: chartTheme.statusSummary.success,
    },
  ];

  return (
    <StatusTileCards
      items={items}
      entityName="task"
      onCardClick={onCardClick}
      selectedKey={selectedStatus}
      size="small"
    />
  );
};

export default TaskSummaryCards;
