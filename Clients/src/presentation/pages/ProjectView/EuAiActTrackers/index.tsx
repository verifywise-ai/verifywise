import { Ref, useEffect, useMemo, useState } from "react";
import { Box, Tab } from "@mui/material";
import TabList from "@mui/lab/TabList";
import TabPanel from "@mui/lab/TabPanel";
import TabContext from "@mui/lab/TabContext";
import { tabStyle, tabPanelStyle } from "../V1.0ProjectView/style";
import { tabListStyle } from "../ProjectFrameworks/styles";
import ComplianceTracker from "../../ComplianceTracker/1.0ComplianceTracker";
import AssessmentTracker from "../../Assessment/1.0AssessmentTracker";
import ReadinessDashboard from "../../ReadinessDashboard";
import { TabFilterBar } from "../../../components/FrameworkFilter/TabFilterBar";
import useUsers from "../../../../application/hooks/useUsers";
import {
  EU_AI_ACT_ASSESSMENT_STATUS_OPTIONS,
  EU_AI_ACT_CONTROL_STATUS_OPTIONS,
  EU_AI_ACT_NEEDS_REVIEW_OPTION,
  FRAMEWORK_IDS,
} from "../../../../application/constants/frameworks";
import { Project } from "../../../../domain/types/Project";

export const EU_AI_ACT_TRACKER_TABS = [
  { label: "Requirements", value: "compliance" },
  { label: "Assessments", value: "assessment" },
  { label: "AI readiness", value: "readiness" },
] as const;

export type EuAiActTrackerTab = (typeof EU_AI_ACT_TRACKER_TABS)[number]["value"];

interface EuAiActTrackersProps {
  project: Project;
  /** EU AI Act on a use case, or EU AI Act (organization) on the organizational project. */
  frameworkId: number;
  tracker: EuAiActTrackerTab;
  onTrackerChange: (tab: EuAiActTrackerTab) => void;
  /** Adds the AI readiness tab, scored by the readiness engine for this framework type. */
  readinessFrameworkType?: string;
  /** The Requirements tab, for the page tour. */
  requirementsTabRef?: Ref<HTMLDivElement>;
}

/**
 * The EU AI Act screen: its filters, the Requirements and Assessments tabs
 * (plus AI readiness when scored) and their trackers. A use case's EU AI Act
 * and the organizational project's EU AI Act (organization) both render it, so
 * the two look and work the same.
 */
const EuAiActTrackers = ({
  project,
  frameworkId,
  tracker,
  onTrackerChange,
  readinessFrameworkType,
  requirementsTabRef,
}: EuAiActTrackersProps) => {
  const { users } = useUsers();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [approverFilter, setApproverFilter] = useState<string>("");
  const [dueDateFilter, setDueDateFilter] = useState<string>("");

  useEffect(() => {
    setStatusFilter("");
  }, [tracker]);

  const tabs = EU_AI_ACT_TRACKER_TABS.filter(
    (tab) => tab.value !== "readiness" || Boolean(readinessFrameworkType),
  );

  // EU AI Act (organization) also filters on the upgrade's "copied, review" marker.
  const statusOptions = useMemo(() => {
    const base =
      tracker === "compliance"
        ? EU_AI_ACT_CONTROL_STATUS_OPTIONS
        : EU_AI_ACT_ASSESSMENT_STATUS_OPTIONS;
    return frameworkId === FRAMEWORK_IDS.EU_AI_ACT_ORGANIZATION
      ? [...base, EU_AI_ACT_NEEDS_REVIEW_OPTION]
      : base;
  }, [tracker, frameworkId]);

  const userOptions = useMemo(
    () =>
      users.map((user: any) => ({
        value: user.id?.toString() || "",
        label: `${user.name} ${user.surname}`,
      })),
    [users],
  );

  return (
    <>
      <TabFilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        showStatusFilter={tracker === "compliance" || tracker === "assessment"}
        statusOptions={statusOptions}
        ownerFilter={ownerFilter}
        onOwnerChange={setOwnerFilter}
        approverFilter={approverFilter}
        onApproverChange={setApproverFilter}
        dueDateFilter={dueDateFilter}
        onDueDateChange={setDueDateFilter}
        showOwnerFilter={tracker === "compliance"}
        showApproverFilter={tracker === "compliance"}
        showDueDateFilter={tracker === "compliance"}
        ownerOptions={userOptions}
        approverOptions={userOptions}
      />
      <TabContext value={tracker}>
        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 1 }}>
          <TabList
            onChange={(_, v) => onTrackerChange(v)}
            TabIndicatorProps={{ style: { backgroundColor: "brand.primary" } }}
            sx={tabListStyle}
          >
            {tabs.map((tab) => (
              <Tab
                key={tab.value}
                sx={tabStyle}
                label={tab.label}
                value={tab.value}
                disableRipple
                data-joyride-id={tab.value === "compliance" ? "compliance-heading" : undefined}
                ref={tab.value === "compliance" ? requirementsTabRef : undefined}
              />
            ))}
          </TabList>
        </Box>
        <TabPanel value="compliance" sx={tabPanelStyle}>
          <ComplianceTracker
            project={project}
            frameworkId={frameworkId}
            statusFilter={statusFilter}
            ownerFilter={ownerFilter}
            approverFilter={approverFilter}
            dueDateFilter={dueDateFilter}
          />
        </TabPanel>
        <TabPanel value="assessment" sx={tabPanelStyle}>
          <AssessmentTracker
            project={project}
            frameworkId={frameworkId}
            statusFilter={statusFilter}
          />
        </TabPanel>
        {readinessFrameworkType && (
          // Tighter top padding than the sibling panels: readiness opens with a
          // right-aligned control strip, so the default 20px reads as dead space.
          <TabPanel value="readiness" sx={{ ...tabPanelStyle, pt: 6 }}>
            <ReadinessDashboard
              projectId={Number(project.id)}
              frameworkType={readinessFrameworkType}
            />
          </TabPanel>
        )}
      </TabContext>
    </>
  );
};

export default EuAiActTrackers;
