import { Stack, Typography } from "@mui/material";
import {
  projectViewHeaderDesc,
  projectViewHeaderTitle,
  tabPanelStyle,
} from "./style";
import TabPanel from "@mui/lab/TabPanel";
import { SyntheticEvent, useState, useEffect, useMemo } from "react";
import TabContext from "@mui/lab/TabContext";
import VWProjectOverview from "./Overview";
import { useSearchParams } from "react-router-dom";
import CustomizableSkeleton from "../../../components/Skeletons";
import VWProjectRisks from "./ProjectRisks";
import LinkedModels from "./LinkedModels";
import ProjectSettings from "../ProjectSettings";
import useProjectData from "../../../../application/hooks/useProjectData";
import ProjectFrameworks from "../ProjectFrameworks";
import CustomizableToast from "../../../components/Toast";
import CEMarking from "../CEMarking";
import Activity from "../Activity";
import PostMarketMonitoring from "../PostMarketMonitoring";
import allowedRoles from "../../../../application/constants/permissions";
import { PageBreadcrumbs } from "../../../components/breadcrumbs/PageBreadcrumbs";
import { useAuth } from "../../../../application/hooks/useAuth";
import { BreadcrumbItem } from "../../../types/interfaces/i.breadcrumbs";
import { getRouteIcon } from "../../../components/breadcrumbs/routeMapping";
import { FileText as FileTextIcon } from "lucide-react";
import TabBar from "../../../components/TabBar";
import { getAllProjectRisksByProjectId } from "../../../../application/repository/projectRisk.repository";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { usePluginRegistry } from "../../../../application/contexts/PluginRegistry.context";
import { PLUGIN_SLOTS } from "../../../../domain/constants/pluginSlots";
import { apiServices } from "../../../../infrastructure/api/networkServices";

const VWProjectView = () => {
  const { userRoleName } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "1";
  // Extract numeric ID from composite IDs (e.g., "prefix-123" -> 123)
  const numericProjectId = projectId.includes("-")
    ? parseInt(projectId.substring(projectId.lastIndexOf("-") + 1), 10) || 0
    : parseInt(projectId, 10) || 0;
  const tabParam = searchParams.get("tab");
  const framework = searchParams.get("framework");
  const [refreshKey, setRefreshKey] = useState(0);
  const { project } = useProjectData({ projectId, refreshKey });
  const { getComponentsForSlot } = usePluginRegistry();

  // Get project source (if any) for slot matching
  const projectSource = (project as any)?._source;

  // Helper to get plugin component for a slot
  const getPluginComponent = (slotId: string) => {
    const components = getComponentsForSlot(slotId);
    return components.find((c) => c.pluginKey === projectSource);
  };

  // Get plugin components for each tab slot
  const pluginOverview = getPluginComponent(PLUGIN_SLOTS.USE_CASE_OVERVIEW);
  const pluginRisks = getPluginComponent(PLUGIN_SLOTS.USE_CASE_RISKS);
  const pluginModels = getPluginComponent(PLUGIN_SLOTS.USE_CASE_MODELS);
  const pluginFrameworks = getPluginComponent(PLUGIN_SLOTS.USE_CASE_FRAMEWORKS);
  const pluginCeMarking = getPluginComponent(PLUGIN_SLOTS.USE_CASE_CE_MARKING);
  const pluginActivity = getPluginComponent(PLUGIN_SLOTS.USE_CASE_ACTIVITY);
  const pluginMonitoring = getPluginComponent(PLUGIN_SLOTS.USE_CASE_MONITORING);
  const pluginSettings = getPluginComponent(PLUGIN_SLOTS.USE_CASE_SETTINGS);

  // Initialize tab value from URL parameter or default to "overview"
  const [value, setValue] = useState(tabParam || "overview");
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  // State for tab counts
  const [projectRisksCount, setProjectRisksCount] = useState<number>(0);
  const [linkedModelsCount, setLinkedModelsCount] = useState<number>(0);
  const [isLoadingRisks, setIsLoadingRisks] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Create custom breadcrumb items
  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const items: BreadcrumbItem[] = [
      {
        label: "Dashboard",
        path: "/",
        icon: getRouteIcon("/"),
      },
      {
        label: "Use cases",
        path: "/overview",
        icon: getRouteIcon("/overview"),
      },
    ];

    // Add the project name as the last breadcrumb item if project is loaded
    if (project) {
      items.push({
        label: project.project_title,
        path: "", // No path since this is the current page
        disabled: true, // Make it non-clickable as it's the current page
        icon: <FileTextIcon size={14} strokeWidth={1.5} />,
      });
    }

    return items;
  }, [project]);

  // Update tab value when URL parameter changes
  useEffect(() => {
    if (tabParam) {
      setValue(tabParam);
    }
  }, [tabParam]);

  // Fetch project risks count - errors are handled gracefully
  useEffect(() => {
    const fetchRisksCount = async () => {
      if (!numericProjectId) return;
      setIsLoadingRisks(true);
      try {
        const response = await getAllProjectRisksByProjectId({
          projectId: String(numericProjectId),
          filter: "active",
        });
        setProjectRisksCount(response.data?.length || 0);
      } catch {
        setProjectRisksCount(0);
      } finally {
        setIsLoadingRisks(false);
      }
    };
    fetchRisksCount();
  }, [numericProjectId, refreshKey]);

  // Fetch linked models count - errors are handled gracefully
  useEffect(() => {
    const fetchLinkedModelsCount = async () => {
      if (!numericProjectId) return;
      setIsLoadingModels(true);
      try {
        const response = await getAllEntities({
          routeUrl: `/modelInventory/by-projectId/${numericProjectId}`,
        });
        setLinkedModelsCount(response.data?.length || 0);
      } catch {
        setLinkedModelsCount(0);
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchLinkedModelsCount();
  }, [numericProjectId, refreshKey]);

  const handleChange = (_: SyntheticEvent, newValue: string) => {
    if (tabParam) {
      searchParams.delete("tab");
      searchParams.delete("framework");
      searchParams.delete("topicId");
      searchParams.delete("questionId");
      setSearchParams(searchParams);
    }
    setValue(newValue);
  };

  const handleRefresh = (isTrigger: boolean, toastMessage?: string) => {
    if (isTrigger) {
      setRefreshKey((prevKey) => prevKey + 1);
      if (toastMessage) {
        setToast({ message: toastMessage, visible: true });
        setTimeout(() => setToast({ message: "", visible: false }), 3000);
      }
    }
  };

  // Check approval status
  const approvalStatus = project && (project as any).approval_status;
  const isApprovalBlocked = approvalStatus === 'pending' || approvalStatus === 'rejected';

  // Determine tooltip message based on approval status
  const getDisabledTooltip = () => {
    if (approvalStatus === 'rejected') {
      return "This use case has been rejected. All tabs are disabled as the use case is no longer usable.";
    } else if (approvalStatus === 'pending') {
      return "This use case has a pending approval request. All tabs are disabled until the request is approved.";
    }
    return "This tab is currently unavailable.";
  };

  return (
    <Stack className="vw-project-view">
      <PageBreadcrumbs
        items={breadcrumbItems}
        autoGenerate={false}
        showCurrentPage={true}
      />
      {toast.visible && <CustomizableToast title={toast.message} />}
      <Stack className="vw-project-view-header" sx={{ mb: 10 }}>
        {project ? (
          <>
            <Typography sx={projectViewHeaderTitle}>
              Use-case general view
            </Typography>
            <Typography sx={projectViewHeaderDesc}>
              This use case includes all the governance process status of{" "}
              <Typography component="span" sx={{ color: "brand.primary", fontSize: "inherit" }}>
                {project.project_title}
              </Typography>
            </Typography>
          </>
        ) : (
          <>
            <CustomizableSkeleton variant="text" width="60%" height={32} />
            <CustomizableSkeleton variant="text" width="80%" height={24} />
          </>
        )}
      </Stack>
      <Stack className="vw-project-view-body">
        <TabContext value={value}>
          <TabBar
            tabs={[
              {
                label: "Overview",
                value: "overview",
                icon: "LayoutDashboard",
                disabled: isApprovalBlocked,
                tooltip: "Use case details, risk summary and status",
              },
              {
                label: "Use case risks",
                value: "project-risks",
                icon: "AlertTriangle",
                count: projectRisksCount,
                isLoading: isLoadingRisks,
                disabled: isApprovalBlocked,
                tooltip: "Risks specific to this use case",
              },
              {
                label: "Linked models",
                value: "linked-models",
                icon: "Box",
                count: linkedModelsCount,
                isLoading: isLoadingModels,
                disabled: isApprovalBlocked,
                tooltip: "AI models associated with this use case",
              },
              {
                label: "Frameworks/regulations",
                value: "frameworks",
                icon: "Shield",
                disabled: isApprovalBlocked,
                tooltip: "Compliance frameworks applied to this use case",
              },
              {
                label: "CE Marking",
                value: "ce-marking",
                icon: "Award",
                disabled: isApprovalBlocked,
                tooltip: "EU conformity assessment and CE marking status",
              },
              {
                label: "Activity",
                value: "activity",
                icon: "History",
                disabled: isApprovalBlocked,
                tooltip: "Recent changes and audit trail",
              },
              {
                label: "Monitoring",
                value: "monitoring",
                icon: "ClipboardCheck",
                disabled: isApprovalBlocked,
                tooltip: "Post-deployment monitoring and checks",
              },
              {
                label: "Settings",
                value: "settings",
                icon: "Settings",
                disabled: isApprovalBlocked || !allowedRoles.projects.edit.includes(userRoleName),
                tooltip: "Use case configuration and permissions",
              },
            ]}
            activeTab={value}
            onChange={handleChange}
            disabledTabTooltip={getDisabledTooltip()}
          />

          <TabPanel value="overview" sx={tabPanelStyle}>
            {project ? (
              pluginOverview ? (
                <pluginOverview.Component project={project} apiServices={apiServices} />
              ) : (
                <VWProjectOverview project={project} />
              )
            ) : (
              <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
            )}
          </TabPanel>

          <TabPanel value="project-risks" sx={tabPanelStyle}>
            {project ? (
              pluginRisks ? (
                <pluginRisks.Component project={project} apiServices={apiServices} />
              ) : (
                <VWProjectRisks />
              )
            ) : (
              <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
            )}
          </TabPanel>

          <TabPanel value="linked-models" sx={tabPanelStyle}>
            {project ? (
              pluginModels ? (
                <pluginModels.Component project={project} apiServices={apiServices} />
              ) : (
                <LinkedModels project={project} />
              )
            ) : (
              <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
            )}
          </TabPanel>

          <TabPanel value="frameworks" sx={tabPanelStyle}>
            {project ? (
              pluginFrameworks ? (
                <pluginFrameworks.Component project={project} apiServices={apiServices} />
              ) : (
                <ProjectFrameworks
                  project={project}
                  triggerRefresh={handleRefresh}
                  initialFrameworkId={
                    framework === "iso-42001"
                      ? 2
                      : framework === "eu-ai-act"
                      ? 1
                      : project.framework && project.framework.length > 0
                      ? project.framework[0].framework_id
                      : 1
                  }
                />
              )
            ) : (
              <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
            )}
          </TabPanel>

          <TabPanel value="ce-marking" sx={tabPanelStyle}>
            {project ? (
              pluginCeMarking ? (
                <pluginCeMarking.Component project={project} apiServices={apiServices} />
              ) : (
                <CEMarking projectId={projectId} />
              )
            ) : (
              <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
            )}
          </TabPanel>

          <TabPanel value="settings" sx={tabPanelStyle}>
            {project ? (
              pluginSettings ? (
                <pluginSettings.Component project={project} apiServices={apiServices} />
              ) : (
                <ProjectSettings triggerRefresh={handleRefresh} />
              )
            ) : (
              <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
            )}
          </TabPanel>

          <TabPanel value="activity" sx={tabPanelStyle}>
            {project ? (
              pluginActivity ? (
                <pluginActivity.Component project={project} apiServices={apiServices} />
              ) : (
                <Activity entityType="use_case" entityId={numericProjectId} />
              )
            ) : (
              <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
            )}
          </TabPanel>

          <TabPanel value="monitoring" sx={tabPanelStyle}>
            {project ? (
              pluginMonitoring ? (
                <pluginMonitoring.Component project={project} apiServices={apiServices} />
              ) : (
                <PostMarketMonitoring />
              )
            ) : (
              <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
            )}
          </TabPanel>
        </TabContext>
      </Stack>
    </Stack>
  );
};

export default VWProjectView;
