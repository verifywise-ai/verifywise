import { useState, useEffect, useMemo, useContext, useCallback } from "react";
import { Box, Button, Tab, Alert } from "@mui/material";
import TabList from "@mui/lab/TabList";
import TabPanel from "@mui/lab/TabPanel";
import TabContext from "@mui/lab/TabContext";
import { tabStyle, tabPanelStyle } from "../V1.0ProjectView/style";
import CustomizableSkeleton from "../../../components/Skeletons";
import ComplianceTracker from "../../../pages/ComplianceTracker/1.0ComplianceTracker";
import { Project } from "../../../../domain/types/Project";
import { Framework } from "../../../../domain/types/Framework";
import AssessmentTracker from "../../Assessment/1.0AssessmentTracker";
import useFrameworks from "../../../../application/hooks/useFrameworks";
import AddFrameworkModal from "../AddNewFramework";
import useMultipleOnScreen from "../../../../application/hooks/useMultipleOnScreen";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import { ButtonToggle } from "../../../components/button-toggle";
import { PluginSlot } from "../../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../../domain/constants/pluginSlots";
import { usePluginRegistry } from "../../../../application/contexts/PluginRegistry.context";

import {
  containerStyle,
  headerContainerStyle,
  addButtonStyle,
  tabListStyle,
} from "./styles";
import allowedRoles from "../../../../application/constants/permissions";
import { TabFilterBar } from "../../../components/FrameworkFilter/TabFilterBar";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { text } from "../../../themes/palette";

const FRAMEWORK_IDS = {
  EU_AI_ACT: 1,
} as const;

const TRACKER_TABS = [
  { label: "Requirements", value: "compliance" },
  { label: "Controls", value: "assessment" },
] as const;

type TrackerTab = (typeof TRACKER_TABS)[number]["value"];

const ProjectFrameworks = ({
  project,
  triggerRefresh,
  initialFrameworkId,
}: {
  project: Project;
  triggerRefresh?: (isTrigger: boolean, toastMessage?: string) => void;
  initialFrameworkId: number;
}) => {
  const {
    filteredFrameworks,
    loading,
    error,
    refreshFilteredFrameworks,
    allFrameworks,
  } = useFrameworks({
    listOfFrameworks: project.framework,
  });
  const [selectedFrameworkId, setSelectedFrameworkId] =
    useState<number>(initialFrameworkId);
  const [selectedFramework, setSelectedFramework] = useState<number>(0);
  const [tracker, setTracker] = useState<TrackerTab>("compliance");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { users } = useUsers();

  const { changeComponentVisibility } = useContext(VerifyWiseContext);
  const { userRoleName } = useAuth();
  const { getComponentsForSlot } = usePluginRegistry();

  const { refs, allVisible } = useMultipleOnScreen<HTMLElement>({
    countToTrigger: 1,
  });

  const isManagingFrameworksDisabled =
    !allowedRoles.frameworks.manage.includes(userRoleName);

  // Filter out organizational frameworks
  const nonOrganizationalFrameworks = useMemo(
    () => {
        return allFrameworks.filter((framework: Framework) => !framework.is_organizational)
    }, [allFrameworks]
  );

  useEffect(() => {
    changeComponentVisibility("projectFrameworks", allVisible);
    changeComponentVisibility(
      "compliance",
      tracker === "compliance" && allVisible
    );
  }, [allVisible, tracker, changeComponentVisibility]);

  const associatedFrameworkIds = project.framework?.map((f) => f.framework_id) || [];

  const projectFrameworks = useMemo(
    () =>
      filteredFrameworks.filter((fw: Framework) =>
        associatedFrameworkIds.includes(Number(fw.id))
      ),
    [filteredFrameworks, associatedFrameworkIds]
  );

  useEffect(() => {
    if (!loading && projectFrameworks.length > 0 && !hasInitialized) {
      const validIds = projectFrameworks.map((fw: Framework) => Number(fw.id));
      const subtabParam = searchParams.get("subtab");

      // If initialFrameworkId is provided and valid, use it
      if (initialFrameworkId && validIds.includes(initialFrameworkId)) {
        setSelectedFrameworkId(initialFrameworkId);
        const index = projectFrameworks.findIndex((fw: Framework) => Number(fw.id) === initialFrameworkId);
        setSelectedFramework(index >= 0 ? index : 0);
        // Check for subtab parameter first, then controlId, default to assessment
        if (subtabParam === "compliance" || subtabParam === "assessment") {
          setTracker(subtabParam as TrackerTab);
        } else {
          setTracker(searchParams.get("controlId") ? "compliance" : "assessment");
        }
      }
      // Otherwise, use the default logic
      else if (
        !selectedFrameworkId ||
        !validIds.includes(selectedFrameworkId)
      ) {
        const initialFramework = projectFrameworks[0];
        setSelectedFrameworkId(Number(initialFramework.id));
        setSelectedFramework(0);
        setTracker("compliance");
      }

      setHasInitialized(true);
    }
  }, [
    loading,
    projectFrameworks,
    selectedFrameworkId,
    initialFrameworkId,
    hasInitialized,
    searchParams
  ]);

  const handleFrameworkSelect = (index: number) => {
    searchParams.delete("framework");
    searchParams.delete("topicId");
    searchParams.delete("questionId");
    setSearchParams(searchParams);
    setSelectedFramework(index);
    setSelectedFrameworkId(Number(projectFrameworks[index]?.id));
    setTracker("compliance");
  };

  const isEUAIAct = Number(selectedFrameworkId) === FRAMEWORK_IDS.EU_AI_ACT;
  const tabs = TRACKER_TABS;

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [applicabilityFilter, setApplicabilityFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [approverFilter, setApproverFilter] = useState<string>("");
  const [dueDateFilter, setDueDateFilter] = useState<string>("");

  const euAIActStatusOptions = [
    { value: "waiting", label: "Waiting" },
    { value: "in progress", label: "In progress" },
    { value: "done", label: "Done" },
  ];

  const euAIActAssessmentsOptions = [
    { value: "not started", label: "Not started" },
    { value: "in progress", label: "In progress" },
    { value: "done", label: "Done" },
  ];

  const statusOptions = isEUAIAct
    ? tracker === "compliance"
      ? euAIActStatusOptions
      : euAIActAssessmentsOptions
    : [];

  // User options for owner and approver filters
  const userOptions = useMemo(() => {
    return users.map((user: any) => ({
      value: user.id?.toString() || "",
      label: `${user.name} ${user.surname}`,
    }));
  }, [users]);

  useEffect(() => {
    setStatusFilter("");
    setApplicabilityFilter("");
  }, [tracker]);

  // Render built-in framework content
  const renderBuiltInContent = useCallback(() => {
    // Show empty state if no frameworks installed
    if (projectFrameworks.length === 0 && !loading) {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 8,
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              backgroundColor: "background.hover",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={text.disabled} strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </Box>
          <Box sx={{ fontSize: 18, fontWeight: 600, color: "#374151", mb: 1 }}>
            No frameworks installed
          </Box>
          <Box sx={{ fontSize: 14, color: "status.default.text", maxWidth: 400, mb: 3 }}>
            This use case doesn't have any compliance frameworks yet.
            Add a framework to start tracking controls and assessments.
          </Box>
          <Button
            variant="contained"
            sx={addButtonStyle}
            onClick={() => setIsModalOpen(true)}
            disabled={isManagingFrameworksDisabled}
          >
            Add Framework
          </Button>
        </Box>
      );
    }

    return (
    <>
      <TabFilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        applicabilityFilter={applicabilityFilter}
        onApplicabilityChange={setApplicabilityFilter}
        showStatusFilter={
          isEUAIAct && (tracker === "compliance" || tracker === "assessment")
        }
        showApplicabilityFilter={false}
        statusOptions={statusOptions}
        ownerFilter={ownerFilter}
        onOwnerChange={setOwnerFilter}
        approverFilter={approverFilter}
        onApproverChange={setApproverFilter}
        dueDateFilter={dueDateFilter}
        onDueDateChange={setDueDateFilter}
        showOwnerFilter={isEUAIAct && tracker === "compliance"}
        showApproverFilter={isEUAIAct && tracker === "compliance"}
        showDueDateFilter={isEUAIAct && tracker === "compliance"}
        ownerOptions={userOptions}
        approverOptions={userOptions}
      />
      <TabContext value={tracker}>
        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 1 }}>
          <TabList
            onChange={(_, v) => setTracker(v)}
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
                data-joyride-id={
                  tab.value === "compliance" ? "compliance-heading" : undefined
                }
                ref={tab.value === "compliance" ? refs[0] : undefined}
              />
            ))}
          </TabList>
        </Box>
        {isEUAIAct ? (
          <>
            <TabPanel value="compliance" sx={tabPanelStyle}>
              <ComplianceTracker
                project={project}
                statusFilter={statusFilter}
                ownerFilter={ownerFilter}
                approverFilter={approverFilter}
                dueDateFilter={dueDateFilter}
              />
            </TabPanel>
            <TabPanel value="assessment" sx={tabPanelStyle}>
              <AssessmentTracker
                project={project}
                statusFilter={statusFilter}
              />
            </TabPanel>
          </>
        ) : (
          <TabPanel value="compliance" sx={tabPanelStyle}>
            <ComplianceTracker
              project={project}
              statusFilter={statusFilter}
              ownerFilter={ownerFilter}
              approverFilter={approverFilter}
              dueDateFilter={dueDateFilter}
            />
          </TabPanel>
        )}
      </TabContext>
    </>
    );
  }, [
    statusFilter, applicabilityFilter, ownerFilter, approverFilter, dueDateFilter,
    isEUAIAct, tracker, statusOptions, userOptions, tabs, refs, project, tabListStyle,
    projectFrameworks.length, loading, isManagingFrameworksDisabled, setIsModalOpen
  ]);

  if (error) {
    return (
      <Box sx={containerStyle}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button onClick={refreshFilteredFrameworks} variant="contained">
          Retry
        </Button>
      </Box>
    );
  }

  // Check if plugin is providing custom framework controls
  const hasCustomFrameworkPlugin = getComponentsForSlot(PLUGIN_SLOTS.PROJECT_CONTROLS_CUSTOM_FRAMEWORK).length > 0;

  // Render the "Manage frameworks" button
  const renderManageButton = () => (
    <Button
      variant="contained"
      sx={addButtonStyle}
      onClick={() => setIsModalOpen(true)}
      disabled={isManagingFrameworksDisabled}
    >
      Manage frameworks/regulations
    </Button>
  );

  return (
    <Box sx={containerStyle}>
      {/* Header with toggle and button - only shown when NO plugin */}
      {!hasCustomFrameworkPlugin && (
        <Box sx={headerContainerStyle}>
          {loading ? (
            <CustomizableSkeleton
              variant="rectangular"
              width={200}
              height={40}
            />
          ) : projectFrameworks.length > 0 ? (
            <ButtonToggle
              options={projectFrameworks.map((fw: Framework, index: number) => ({
                value: index.toString(),
                label: fw.name,
              }))}
              value={selectedFramework.toString()}
              onChange={(value) => handleFrameworkSelect(parseInt(value))}
              height={34}
            />
          ) : null}
          {renderManageButton()}
        </Box>
      )}

      {/* Plugin slot - renders header (toggle + button) + content when plugin is loaded */}
      <PluginSlot
        id={PLUGIN_SLOTS.PROJECT_CONTROLS_CUSTOM_FRAMEWORK}
        slotProps={{
          project: project,
          builtInFrameworks: projectFrameworks,
          selectedBuiltInFramework: selectedFramework,
          onBuiltInFrameworkSelect: handleFrameworkSelect,
          renderBuiltInContent: renderBuiltInContent,
          renderHeaderActions: renderManageButton,
          onRefresh: () => {
            if (triggerRefresh) triggerRefresh(true);
            refreshFilteredFrameworks();
          },
        }}
      />

      <AddFrameworkModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        frameworks={nonOrganizationalFrameworks}
        project={project}
        onFrameworksChanged={(action, frameworkId?: number) => {
          if (triggerRefresh) {
            if (action === "add")
              triggerRefresh(true, "Framework added successfully");
            else if (action === "remove") {
              triggerRefresh(true, "Framework removed successfully");
              // Find a framework whose id is not the removed one, and set its id as selected
              const nextFramework = project.framework?.find(
                (f) => Number(f.framework_id) !== frameworkId
              );
              if (nextFramework) {
                const index = projectFrameworks.findIndex(
                  (fw: Framework) => Number(fw.id) === nextFramework.framework_id
                );
                handleFrameworkSelect(index >= 0 ? index : 0);
              }
            } else triggerRefresh(true);
          }
          refreshFilteredFrameworks();
        }}
      />

      {/* Default content when no plugin is loaded */}
      {!hasCustomFrameworkPlugin && projectFrameworks.length > 0 && renderBuiltInContent()}

      {/* Empty state when no frameworks installed */}
      {!hasCustomFrameworkPlugin && projectFrameworks.length === 0 && !loading && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 8,
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              backgroundColor: "background.hover",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={text.disabled} strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </Box>
          <Box sx={{ fontSize: 18, fontWeight: 600, color: "#374151", mb: 1 }}>
            No frameworks installed
          </Box>
          <Box sx={{ fontSize: 14, color: "status.default.text", maxWidth: 400, mb: 3 }}>
            This use case doesn't have any compliance frameworks yet.
            Add a framework to start tracking controls and assessments.
          </Box>
          <Button
            variant="contained"
            sx={addButtonStyle}
            onClick={() => setIsModalOpen(true)}
            disabled={isManagingFrameworksDisabled}
          >
            Add Framework
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default ProjectFrameworks;
