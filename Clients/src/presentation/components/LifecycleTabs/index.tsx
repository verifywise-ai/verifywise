import React from "react";
import { Box } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabBar, { TabItem } from "../TabBar";
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABELS,
  LifecycleStage,
  LifecycleStageCounts,
} from "../../../domain/enums/lifecycleStage.enum";
import { lifecycleTabCount } from "../../../application/utils/useCaseLifecycle";

/**
 * In review / Planned / Live / Retired tabs with counts (#5187). Entity
 * agnostic: use cases render it today, AI apps reuse it.
 *
 * `extraCounts` is the extension point for rows that are not entities yet but
 * belong in a stage, e.g. pending intake submissions in "In review" (#5188):
 * they are added to that tab's count without changing this component.
 */
export interface LifecycleTabsProps {
  value: LifecycleStage;
  onChange: (stage: LifecycleStage) => void;
  counts?: Partial<LifecycleStageCounts>;
  extraCounts?: Partial<LifecycleStageCounts>;
  isLoading?: boolean;
  /** One tooltip per stage, worded for the entity (use case, AI app). */
  tooltips?: Partial<Record<LifecycleStage, string>>;
  dataJoyrideId?: string;
}

const ICONS: Record<LifecycleStage, TabItem["icon"]> = {
  [LifecycleStage.IN_REVIEW]: "ClipboardCheck",
  [LifecycleStage.PLANNED]: "CalendarClock",
  [LifecycleStage.LIVE]: "Activity",
  [LifecycleStage.RETIRED]: "Archive",
};

const LifecycleTabs: React.FC<LifecycleTabsProps> = ({
  value,
  onChange,
  counts,
  extraCounts,
  isLoading,
  tooltips,
  dataJoyrideId,
}) => {
  const tabs: TabItem[] = LIFECYCLE_STAGES.map((stage) => ({
    label: LIFECYCLE_STAGE_LABELS[stage],
    value: stage,
    icon: ICONS[stage],
    count: lifecycleTabCount(stage, counts, extraCounts),
    isLoading,
    tooltip: tooltips?.[stage],
  }));

  return (
    <TabContext value={value}>
      <Box sx={{ mb: "16px" }}>
        <TabBar
          tabs={tabs}
          activeTab={value}
          onChange={(_event, next) => onChange(next as LifecycleStage)}
          dataJoyrideId={dataJoyrideId}
        />
      </Box>
    </TabContext>
  );
};

export default LifecycleTabs;
